/**
 * Email Configuration and Testing Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { createEmailService, EmailService } from '../services/emailService.js';
import { encrypt, decrypt } from '../utils/encryption.js';
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

    // Return config without sensitive data
    res.json({
      success: true,
      data: {
        provider: emailConfig.provider || null,
        fromName: emailConfig.fromName || '',
        fromEmail: emailConfig.fromEmail || '',
        smtp: emailConfig.smtp
          ? {
              host: emailConfig.smtp.host,
              port: emailConfig.smtp.port,
              secure: emailConfig.smtp.secure,
              user: emailConfig.smtp.user,
              // Don't return password
            }
          : null,
        gmail: emailConfig.gmail
          ? {
              user: emailConfig.gmail.user,
              // Don't return client secret or refresh token
            }
          : null,
        outlook: emailConfig.outlook
          ? {
              user: emailConfig.outlook.user,
              // Don't return client secret or refresh token
            }
          : null,
        isConfigured: !!emailConfig.provider,
      },
    });
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

    // Update email config
    settings.email = {
      provider: config.provider,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
    };

    if (config.smtp) {
      settings.email.smtp = config.smtp;
    }
    if (config.gmail) {
      settings.email.gmail = config.gmail;
    }
    if (config.outlook) {
      settings.email.outlook = config.outlook;
    }

    // Save settings
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: JSON.stringify(settings),
      },
    });

    // Test connection
    let testResult = { success: false, error: 'Not tested' };
    try {
      const emailService = new EmailService({
        provider: config.provider,
        fromName: config.fromName,
        fromEmail: config.fromEmail,
        smtp: config.smtp,
        gmail: config.gmail,
        outlook: config.outlook,
      });
      testResult = await emailService.verifyConnection();
    } catch (error: any) {
      testResult = { success: false, error: error.message };
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

    // Get tenant settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        settings: true,
      },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const settings = JSON.parse(tenant.settings || '{}');
    const emailConfig = settings.email;

    if (!emailConfig || !emailConfig.provider) {
      throw new ApiError(
        'EMAIL_NOT_CONFIGURED',
        'Email not configured for this practice',
        400
      );
    }

    // Create email service
    const emailService = new EmailService({
      provider: emailConfig.provider,
      fromName: emailConfig.fromName,
      fromEmail: emailConfig.fromEmail,
      smtp: emailConfig.smtp,
      gmail: emailConfig.gmail,
      outlook: emailConfig.outlook,
    });

    // Send test email
    const result = await emailService.sendEmail({
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
    });

    if (!result.success) {
      throw new ApiError(
        'EMAIL_FAILED',
        result.error || 'Failed to send test email',
        500
      );
    }

    res.json({
      success: true,
      data: {
        messageId: result.messageId,
        sentTo: testEmail,
      },
      message: 'Test email sent successfully',
    });
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

    const tokens = await EmailService.exchangeGmailCode(
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
// NEW SIMPLIFIED OAUTH ROUTES (for frontend OAuthConnect component)
// ============================================================================

// Generate cryptographically secure random state for OAuth
import crypto from 'crypto';
const generateState = () => {
  return crypto.randomBytes(32).toString('hex');
};

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

    const isConnected = emailConfig?.provider === provider && 
      (emailConfig[provider]?.refreshToken || emailConfig[provider === 'microsoft365' ? 'outlook' : provider]?.refreshToken);

    res.json({
      success: true,
      data: {
        isConnected: !!isConnected,
        provider,
        user: isConnected ? (emailConfig[provider]?.user || emailConfig.outlook?.user) : undefined,
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
    
    const state = generateState();

    const redirectUri = `${process.env.API_URL || 'https://engage-by-capstone-production.up.railway.app'}/api/oauth/callback/${provider}`;

    let url: string;

    if (provider === 'gmail') {
      const clientId = process.env.GMAIL_CLIENT_ID;
      if (!clientId) {
        throw new ApiError('NOT_CONFIGURED', 'Gmail OAuth not configured on server', 500);
      }
      url = EmailService.generateGmailAuthUrl(clientId, redirectUri);
    } else {
      // Microsoft 365 or Outlook
      const clientId = process.env.MICROSOFT_CLIENT_ID;
      if (!clientId) {
        throw new ApiError('NOT_CONFIGURED', 'Microsoft OAuth not configured on server', 500);
      }
      // Use 'common' for multi-tenant apps - allows any organization
      url = EmailService.generateMicrosoftAuthUrl(clientId, redirectUri, 'common');
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

// OAuth callback handler - simplified without regex pattern
router.get(
  '/auth/:provider/callback',
  asyncHandler(async (req, res) => {
    const { provider } = req.params;
    const { code, error, state } = req.query;

    // Validate provider
    const validProviders = ['microsoft365', 'outlook', 'gmail'];
    if (!validProviders.includes(provider)) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk';
      return res.redirect(`${frontendUrl}/settings?error=invalid_provider`);
    }

    if (error) {
      // Redirect back to frontend with error
      const frontendUrl = process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk';
      return res.redirect(`${frontendUrl}/settings?error=${encodeURIComponent(error as string)}`);
    }

    if (!code) {
      const frontendUrl = process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk';
      return res.redirect(`${frontendUrl}/settings?error=no_code_received`);
    }

    // Store the code temporarily (in production, use Redis or similar)
    // For now, redirect back to frontend with success
    const frontendUrl = process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk';
    res.redirect(`${frontendUrl}/settings?oauth=success&provider=${provider}&code=${code}&state=${state}`);
  })
);

// Exchange code for tokens (called by frontend)
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

    const redirectUri = `${process.env.API_URL || 'https://engage-by-capstone-production.up.railway.app'}/api/oauth/callback/${provider}`;

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
        tokens = await EmailService.exchangeMicrosoftCode(clientId, clientSecret, redirectUri, code, 'common');
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
        clientId: provider === 'gmail' ? process.env.GMAIL_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID,
        // Store clientSecret encrypted for security
        clientSecret: encrypt(provider === 'gmail' ? process.env.GMAIL_CLIENT_SECRET || '' : process.env.MICROSOFT_CLIENT_SECRET || ''),
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
      throw new ApiError('OAUTH_FAILED', error.message || 'Failed to exchange authorization code', 500);
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
