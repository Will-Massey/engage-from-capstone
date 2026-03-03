/**
 * Email Configuration and Testing Routes
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/auth.js';
import { createEmailService, EmailService } from '../services/emailService.js';
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

export default router;
