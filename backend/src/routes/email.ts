/**
 * Email Configuration and Testing Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { EmailService } from '../services/emailService.js';
import { tenantMailer, getEmailStatusForTenant } from '../services/tenantMailer.js';
import {
  encryptTenantEmailSettingsForSave,
  decryptTenantEmailSettings,
  tenantEmailToConfig,
  type TenantEmailSettings,
} from '../services/tenantEmailSettings.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { createOAuthState } from '../utils/oauthState.js';
import logger from '../config/logger.js';

const router = Router();

// Get email configuration for tenant
router.get(
  '/config',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    // Get tenant settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        settings: true,
      },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const settings = JSON.parse(tenant.settings || '{}');
    const emailConfig = settings.email || {};
    const status = await getEmailStatusForTenant(tenantId);

    // Return config without sensitive data
    res.json({
      success: true,
      data: {
        provider: emailConfig.provider || null,
        fromName: emailConfig.fromName || '',
        fromEmail: emailConfig.fromEmail || '',
        replyToEmail: emailConfig.replyToEmail || status.replyTo || '',
        smtp: emailConfig.smtp
          ? {
              host: emailConfig.smtp.host,
              port: emailConfig.smtp.port,
              secure: emailConfig.smtp.secure,
              user: emailConfig.smtp.user,
            }
          : null,
        gmail: emailConfig.gmail
          ? {
              user: emailConfig.gmail.user,
            }
          : null,
        outlook: emailConfig.outlook
          ? {
              user: emailConfig.outlook.user,
            }
          : null,
        isConfigured: !!emailConfig.provider,
        platform: status,
      },
    });
  })
);

// Update Reply-To only (platform mode — no custom SMTP required)
router.put(
  '/reply-to',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({ replyToEmail: z.string().email() });
    const { replyToEmail } = schema.parse(req.body);
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const settings = JSON.parse(tenant.settings || '{}');
    settings.email = { ...(settings.email || {}), replyToEmail };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: JSON.stringify(settings) },
    });

    res.json({ success: true, data: { replyToEmail }, message: 'Reply-To saved' });
  })
);

// Update email configuration
router.put(
  '/config',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      provider: z.enum(['smtp', 'gmail', 'outlook', 'microsoft365']),
      fromName: z.string().min(1),
      fromEmail: z.string().email(),
      replyToEmail: z.string().email().optional(),
      smtp: z
        .object({
          host: z.string(),
          port: z.number(),
          secure: z.boolean(),
          user: z.string(),
          pass: z.string(),
        })
        .optional(),
      gmail: z
        .object({
          clientId: z.string(),
          clientSecret: z.string(),
          refreshToken: z.string(),
          user: z.string().email(),
        })
        .optional(),
      outlook: z
        .object({
          clientId: z.string(),
          clientSecret: z.string(),
          refreshToken: z.string(),
          user: z.string().email(),
        })
        .optional(),
    });

    const config = schema.parse(req.body);
    const tenantId = req.tenantId!;

    // Get current settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        settings: true,
      },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const settings = JSON.parse(tenant.settings || '{}');
    const existingEmail: TenantEmailSettings = settings.email || {};

    const incoming = {
      provider: config.provider,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
      replyToEmail: config.replyToEmail,
      useCustomEmail: true,
      ...(config.smtp ? { smtp: config.smtp } : {}),
      ...(config.gmail ? { gmail: config.gmail } : {}),
      ...(config.outlook ? { outlook: config.outlook } : {}),
    } as TenantEmailSettings;

    settings.email = encryptTenantEmailSettingsForSave(incoming, existingEmail);

    // Save settings
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: JSON.stringify(settings),
      },
    });

    const decrypted = decryptTenantEmailSettings(settings.email);
    const emailConfig = tenantEmailToConfig(decrypted, config.fromName);

    let testResult: { success: boolean; error?: string } = { success: false, error: 'Not tested' };
    if (emailConfig) {
      try {
        const emailService = await EmailService.createReady(emailConfig);
        testResult = await emailService.verifyConnection();
        if (testResult.success) {
          settings.email.verifiedAt = new Date().toISOString();
          await prisma.tenant.update({
            where: { id: tenantId },
            data: { settings: JSON.stringify(settings) },
          });
        }
      } catch (error: any) {
        testResult = { success: false, error: error.message };
      }
    }

    res.json({
      success: true,
      data: {
        config: {
          provider: config.provider,
          fromName: config.fromName,
          fromEmail: config.fromEmail,
        },
        connectionTest: testResult,
      },
      message: testResult.success
        ? 'Email configuration saved and verified'
        : 'Email configuration saved but connection failed',
    });
  })
);

// Test email configuration
router.post(
  '/test',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      testEmail: z.string().email(),
    });

    const { testEmail } = schema.parse(req.body);
    const tenantId = req.tenantId!;
    const user = req.user!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const result = await tenantMailer.send({
      tenantId,
      messageType: 'TEST',
      message: {
        to: testEmail,
        subject: `Test Email from ${tenant.name}`,
        html: `
        <h2>Test Email</h2>
        <p>This is a test email from ${tenant.name} using Engage by Capstone.</p>
        <p>If you received this, your email configuration is working correctly!</p>
        <hr>
        <p><small>Sent by: ${user.firstName} ${user.lastName}</small></p>
      `,
        text: `Test Email\n\nThis is a test email from ${tenant.name} using Engage by Capstone.\n\nIf you received this, your email configuration is working correctly!\n\nSent by: ${user.firstName} ${user.lastName}`,
        replyTo: user.email,
      },
    });

    if (!result.success) {
      throw new ApiError('EMAIL_FAILED', result.error || 'Failed to send test email', 500);
    }

    res.json({
      success: true,
      data: {
        messageId: result.messageId,
        emailLogId: result.emailLogId,
        provider: result.provider,
        sentTo: testEmail,
      },
      message: 'Test email sent successfully',
    });
  })
);

// Platform email status
router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const status = await getEmailStatusForTenant(req.tenantId!);
    res.json({ success: true, data: status });
  })
);

// Delivery log
router.get(
  '/logs',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);
    const proposalId = req.query.proposalId as string | undefined;
    const clientId = req.query.clientId as string | undefined;

    const logs = await prisma.emailLog.findMany({
      where: {
        tenantId,
        ...(proposalId ? { proposalId } : {}),
        ...(clientId ? { clientId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        messageType: true,
        provider: true,
        status: true,
        to: true,
        from: true,
        replyTo: true,
        subject: true,
        error: true,
        sentAt: true,
        createdAt: true,
        proposalId: true,
        clientId: true,
      },
    });

    res.json({ success: true, data: logs });
  })
);

// Get Gmail OAuth URL
router.get(
  '/auth/gmail/url',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      clientId: z.string(),
      redirectUri: z.string().url(),
    });

    const { clientId, redirectUri } = schema.parse(req.query);

    const url = EmailService.generateGmailAuthUrl(clientId, '', redirectUri);

    res.json({
      success: true,
      data: {
        authUrl: url,
      },
    });
  })
);

// Exchange Gmail code for tokens
router.post(
  '/auth/gmail/exchange',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      redirectUri: z.string().url(),
      code: z.string(),
    });

    const { clientId, clientSecret, redirectUri, code } = schema.parse(req.body);

    const tokens = await EmailService.exchangeGmailCode(clientId, clientSecret, redirectUri, code);

    res.json({
      success: true,
      data: tokens,
    });
  })
);

// Get Microsoft/Outlook OAuth URL
router.get(
  '/auth/microsoft/url',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      clientId: z.string(),
      redirectUri: z.string().url(),
    });

    const { clientId, redirectUri } = schema.parse(req.query);

    const url = EmailService.generateMicrosoftAuthUrl(clientId, redirectUri);

    res.json({
      success: true,
      data: {
        authUrl: url,
      },
    });
  })
);

// Exchange Microsoft code for tokens
router.post(
  '/auth/microsoft/exchange',
  authenticate,
  asyncHandler(async (req, res) => {
    const schema = z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      redirectUri: z.string().url(),
      code: z.string(),
    });

    const { clientId, clientSecret, redirectUri, code } = schema.parse(req.body);

    const tokens = await EmailService.exchangeMicrosoftCode(
      clientId,
      clientSecret,
      redirectUri,
      code
    );

    res.json({
      success: true,
      data: tokens,
    });
  })
);

// Delete email configuration
router.delete(
  '/config',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        settings: true,
      },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const settings = JSON.parse(tenant.settings || '{}');
    delete settings.email;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: JSON.stringify(settings),
      },
    });

    res.json({
      success: true,
      message: 'Email configuration removed',
    });
  })
);

// ============================================================================
// OAuth routes (server-side callback exchange via /api/oauth/callback/*)
// ============================================================================

const oauthRedirectUri = (provider: string) =>
  `${process.env.API_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`}/api/oauth/callback/${provider}`;

// Get OAuth status for a provider
router.get(
  '/auth/:provider/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const { provider } = req.params;

    // Validate provider
    const validProviders = ['microsoft365', 'outlook', 'gmail'];
    if (!validProviders.includes(provider)) {
      throw new ApiError('INVALID_PROVIDER', 'Invalid email provider', 400);
    }

    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const settings = JSON.parse(tenant.settings || '{}');
    const emailConfig = settings.email;

    const isConnected =
      emailConfig?.provider === provider &&
      (emailConfig[provider]?.refreshToken ||
        emailConfig[provider === 'microsoft365' ? 'outlook' : provider]?.refreshToken);

    res.json({
      success: true,
      data: {
        isConnected: !!isConnected,
        provider,
        user: isConnected ? emailConfig[provider]?.user || emailConfig.outlook?.user : undefined,
      },
    });
  })
);

// Get OAuth URL for a provider
router.get(
  '/auth/:provider/url',
  authenticate,
  asyncHandler(async (req, res) => {
    const { provider } = req.params;

    // Validate provider
    const validProviders = ['microsoft365', 'outlook', 'gmail'];
    if (!validProviders.includes(provider)) {
      throw new ApiError('INVALID_PROVIDER', 'Invalid email provider', 400);
    }

    const tenantId = req.tenantId!;
    const userId = req.user!.id;

    const state = createOAuthState({ tenantId, userId, provider });
    const redirectUri = oauthRedirectUri(provider);

    let url: string;

    if (provider === 'gmail') {
      const clientId = process.env.GMAIL_CLIENT_ID;
      const clientSecret = process.env.GMAIL_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new ApiError('NOT_CONFIGURED', 'Gmail OAuth not configured on server', 500);
      }
      url = EmailService.generateGmailAuthUrl(clientId, clientSecret, redirectUri, state);
    } else {
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      if (!clientId) {
        throw new ApiError('NOT_CONFIGURED', 'Microsoft OAuth not configured on server', 500);
      }
      url = EmailService.generateMicrosoftAuthUrl(clientId, redirectUri, 'common', state);
    }

    res.json({
      success: true,
      data: {
        url,
        state,
      },
    });
  })
);

// Legacy browser callback on email router — use /api/oauth/callback/:provider instead
router.get(
  '/auth/:provider/callback',
  asyncHandler(async (_req, res) => {
    throw new ApiError(
      'DEPRECATED',
      'OAuth callback is handled at /api/oauth/callback/:provider',
      410
    );
  })
);

// Exchange code for tokens (legacy — prefer server-side callback)
router.post(
  '/auth/:provider/callback',
  authenticate,
  asyncHandler(async (req, res) => {
    const { provider } = req.params;

    // Validate provider
    const validProviders = ['microsoft365', 'outlook', 'gmail'];
    if (!validProviders.includes(provider)) {
      throw new ApiError('INVALID_PROVIDER', 'Invalid email provider', 400);
    }

    const { code } = req.body;
    const tenantId = req.tenantId!;

    if (!code) {
      throw new ApiError('INVALID_CODE', 'Authorization code required', 400);
    }

    const redirectUri = oauthRedirectUri(provider);

    let tokens: { refreshToken: string; accessToken: string; user?: string };

    try {
      if (provider === 'gmail') {
        const clientId = process.env.GMAIL_CLIENT_ID!;
        const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
        tokens = await EmailService.exchangeGmailCode(clientId, clientSecret, redirectUri, code);
      } else {
        // Microsoft 365 or Outlook
        const clientId = process.env.MICROSOFT_CLIENT_ID!;
        const clientSecret = process.env.MICROSOFT_CLIENT_SECRET!;
        // Use 'common' for multi-tenant apps
        tokens = await EmailService.exchangeMicrosoftCode(
          clientId,
          clientSecret,
          redirectUri,
          code,
          'common'
        );
      }

      // Save to tenant settings
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });

      if (!tenant) {
        throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
      }

      const settings = JSON.parse(tenant.settings || '{}');

      if (!settings.email) {
        settings.email = {};
      }

      settings.email.provider = provider;
      settings.email[provider === 'microsoft365' ? 'outlook' : provider] = {
        clientId:
          provider === 'gmail' ? process.env.GMAIL_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID,
        // Store clientSecret encrypted for security
        clientSecret: encrypt(
          provider === 'gmail'
            ? process.env.GMAIL_CLIENT_SECRET || ''
            : process.env.MICROSOFT_CLIENT_SECRET || ''
        ),
        // Store refresh token encrypted - this is the most sensitive credential
        refreshToken: encrypt(tokens.refreshToken),
        user: tokens.user || req.user?.email,
      };

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { settings: JSON.stringify(settings) },
      });

      res.json({
        success: true,
        data: {
          user: tokens.user || req.user?.email,
          provider,
        },
      });
    } catch (error: any) {
      logger.error('OAuth exchange failed:', error);
      throw new ApiError(
        'OAUTH_FAILED',
        error.message || 'Failed to exchange authorization code',
        500
      );
    }
  })
);

// Disconnect OAuth provider
router.post(
  '/auth/:provider/disconnect',
  authenticate,
  asyncHandler(async (req, res) => {
    const { provider } = req.params;

    // Validate provider
    const validProviders = ['microsoft365', 'outlook', 'gmail'];
    if (!validProviders.includes(provider)) {
      throw new ApiError('INVALID_PROVIDER', 'Invalid email provider', 400);
    }

    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const settings = JSON.parse(tenant.settings || '{}');

    if (settings.email?.provider === provider) {
      delete settings.email[provider === 'microsoft365' ? 'outlook' : provider];
      settings.email.provider = 'smtp'; // Fallback to SMTP

      await prisma.tenant.update({
        where: { id: tenantId },
        data: { settings: JSON.stringify(settings) },
      });
    }

    res.json({
      success: true,
      message: `${provider} disconnected successfully`,
    });
  })
);

export default router;
