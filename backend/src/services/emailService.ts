/**
 * Email Service with Outlook, Gmail, and SMTP Support
 * Handles proposal emails, notifications, and email tracking
 */

import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { decrypt } from '../utils/encryption.js';
import logger from '../config/logger.js';

// Email provider types
export type EmailProvider = 'smtp' | 'gmail' | 'outlook' | 'microsoft365';

// Email configuration interface
export interface EmailConfig {
  provider: EmailProvider;
  smtp?: {
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
  };
  gmail?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    user?: string;
  };
  outlook?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    user?: string;
  };
  fromName: string;
  fromEmail: string;
}

// Email message interface
export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

// Email tracking interface
export interface EmailTracking {
  messageId: string;
  proposalId?: string;
  sentAt: Date;
  to: string;
  subject: string;
  opened?: boolean;
  openedAt?: Date;
  clicked?: boolean;
  clickedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
}

export class EmailService {
  private config: EmailConfig;
  private transporter: nodemailer.Transporter | null = null;
  private oauth2Client: any = null;

  constructor(config: EmailConfig) {
    this.config = config;
    this.initializeTransporter();
  }

  private async initializeTransporter(): Promise<void> {
    try {
      switch (this.config.provider) {
        case 'smtp':
          await this.initializeSMTP();
          break;
        case 'gmail':
          await this.initializeGmail();
          break;
        case 'outlook':
        case 'microsoft365':
          await this.initializeOutlook();
          break;
        default:
          throw new Error(`Unsupported email provider: ${this.config.provider}`);
      }
      logger.info(`Email service initialized: ${this.config.provider}`);
    } catch (error) {
      logger.error('Failed to initialize email transporter:', error);
      throw error;
    }
  }

  private async initializeSMTP(): Promise<void> {
    if (!this.config.smtp) {
      throw new Error('SMTP configuration required');
    }

    this.transporter = nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: {
        user: this.config.smtp.user,
        pass: this.config.smtp.pass,
      },
      tls: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: true,
      } : undefined,
    });

    // Verify connection
    await this.transporter.verify();
  }

  private async initializeGmail(): Promise<void> {
    if (!this.config.gmail) {
      throw new Error('Gmail configuration required');
    }

    const oauth2Client = new google.auth.OAuth2(
      this.config.gmail.clientId,
      this.config.gmail.clientSecret,
      'https://developers.google.com/oauthplayground'
    );

    oauth2Client.setCredentials({
      refresh_token: this.config.gmail.refreshToken,
    });

    this.oauth2Client = oauth2Client;

    // Get access token
    const accessToken = await this.getGmailAccessToken();

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: this.config.gmail.user,
        clientId: this.config.gmail.clientId,
        clientSecret: this.config.gmail.clientSecret,
        refreshToken: this.config.gmail.refreshToken,
        accessToken,
      },
    });
  }

  private async getGmailAccessToken(): Promise<string> {
    try {
      const { token } = await this.oauth2Client.getAccessToken();
      return token || '';
    } catch (error) {
      logger.error('Failed to get Gmail access token:', error);
      throw error;
    }
  }

  private async initializeOutlook(): Promise<void> {
    if (!this.config.outlook) {
      throw new Error('Outlook configuration required');
    }

    // Microsoft Graph OAuth2 configuration
    const oauth2Client = new google.auth.OAuth2(
      this.config.outlook.clientId,
      this.config.outlook.clientSecret,
      'https://login.microsoftonline.com/common/oauth2/nativeclient'
    );

    oauth2Client.setCredentials({
      refresh_token: this.config.outlook.refreshToken,
    });

    this.oauth2Client = oauth2Client;

    // For Outlook/Microsoft 365, we use SMTP with OAuth2
    const accessToken = await this.getOutlookAccessToken();

    this.transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: this.config.outlook.user,
        accessToken,
      },
    });
  }

  private async getOutlookAccessToken(): Promise<string> {
    try {
      // Use Microsoft Graph token endpoint
      const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.config.outlook!.clientId,
          client_secret: this.config.outlook!.clientSecret,
          refresh_token: this.config.outlook!.refreshToken,
          grant_type: 'refresh_token',
          scope: 'https://outlook.office365.com/SMTP.Send offline_access',
        }),
      });

      if (!response.ok) {
        throw new Error(`Outlook token refresh failed: ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.access_token;
    } catch (error) {
      logger.error('Failed to get Outlook access token:', error);
      throw error;
    }
  }

  async sendEmail(message: EmailMessage): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      // Refresh token if needed for OAuth providers
      if (this.config.provider === 'gmail' || this.config.provider === 'outlook') {
        await this.refreshAccessToken();
      }

      const info = await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.fromEmail}>`,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
      });

      logger.info(`Email sent successfully: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error: any) {
      logger.error('Failed to send email:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      let accessToken: string;

      if (this.config.provider === 'gmail') {
        accessToken = await this.getGmailAccessToken();
      } else if (this.config.provider === 'outlook') {
        accessToken = await this.getOutlookAccessToken();
      } else {
        return;
      }

      // Update transporter with new access token
      if (this.transporter) {
        (this.transporter as any).options.auth.accessToken = accessToken;
      }
    } catch (error) {
      logger.error('Failed to refresh access token:', error);
      throw error;
    }
  }

  async sendProposalEmail(params: {
    to: string;
    clientName: string;
    proposalTitle: string;
    proposalReference: string;
    viewLink: string;
    senderName: string;
    senderPosition?: string;
    senderEmail: string;
    validUntil: string;
    tenantName: string;
    totalAmount?: string;
    serviceCount?: number;
    attachment?: Buffer;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { generateProposalEmailTemplate } = await import('../templates/proposalEmail.js');

    const emailTemplate = generateProposalEmailTemplate({
      clientName: params.clientName,
      tenantName: params.tenantName || this.config.fromName,
      proposalReference: params.proposalReference,
      proposalTitle: params.proposalTitle,
      viewLink: params.viewLink,
      senderName: params.senderName,
      senderPosition: params.senderPosition,
      senderEmail: params.senderEmail,
      validUntil: params.validUntil,
      totalAmount: params.totalAmount,
      serviceCount: params.serviceCount,
    });

    const attachments = [];
    if (params.attachment) {
      attachments.push({
        filename: `Proposal_${params.proposalReference}.pdf`,
        content: params.attachment,
        contentType: 'application/pdf',
      });
    }

    return this.sendEmail({
      to: params.to,
      subject: `Proposal: ${params.proposalTitle} - ${params.proposalReference}`,
      html: emailTemplate.html,
      text: emailTemplate.text,
      attachments,
    });
  }

  async verifyConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.transporter) {
        return { success: false, error: 'Transporter not initialized' };
      }

      await this.transporter.verify();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Generate Gmail OAuth2 URL for setup
  static generateGmailAuthUrl(clientId: string, clientSecret: string, redirectUri: string): string {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/gmail.send',
      ],
      prompt: 'consent',
    });
  }

  // Exchange Gmail code for tokens
  static async exchangeGmailCode(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    code: string
  ): Promise<{ refreshToken: string; accessToken: string }> {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error('No refresh token received. User may need to re-authorize with prompt=consent');
    }

    return {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token || '',
    };
  }

  // Generate Microsoft OAuth2 URL for setup
  static generateMicrosoftAuthUrl(clientId: string, redirectUri: string, tenantId?: string): string {
    const scopes = [
      'offline_access',
      'https://outlook.office365.com/SMTP.Send',
      'User.Read',
    ];

    // Use 'common' for multi-tenant apps, or specific tenant ID for single-tenant
    const tenant = tenantId || 'common';

    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?` +
      `client_id=${encodeURIComponent(clientId)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes.join(' '))}` +
      `&prompt=consent`;
  }

  // Exchange Microsoft code for tokens
  static async exchangeMicrosoftCode(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    code: string,
    tenantId?: string
  ): Promise<{ refreshToken: string; accessToken: string; user?: string }> {
    const tenant = tenantId || 'common';
    const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const data = await response.json() as any;

    return {
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      user: data.id_token ? JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64').toString()).email : undefined,
    };
  }
}

// Create email service instance from environment
export function createEmailService(): EmailService | null {
  const provider = process.env.EMAIL_PROVIDER as EmailProvider;

  if (!provider) {
    logger.warn('EMAIL_PROVIDER not set, email service disabled');
    return null;
  }

  const config: EmailConfig = {
    provider,
    fromName: process.env.EMAIL_FROM_NAME || 'Engage by Capstone',
    fromEmail: process.env.EMAIL_FROM_ADDRESS || 'sales@capstonesoftware.co.uk',
  };

  switch (provider) {
    case 'smtp':
      config.smtp = {
        host: process.env.SMTP_HOST || '',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      };
      break;

    case 'gmail':
      config.gmail = {
        clientId: process.env.GMAIL_CLIENT_ID || '',
        clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
        refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
        user: process.env.GMAIL_USER || '',
      };
      break;

    case 'outlook':
    case 'microsoft365':
      config.outlook = {
        clientId: process.env.OUTLOOK_CLIENT_ID || '',
        clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
        refreshToken: process.env.OUTLOOK_REFRESH_TOKEN || '',
        user: process.env.OUTLOOK_USER || '',
      };
      break;
  }

  try {
    return new EmailService(config);
  } catch (error) {
    logger.error('Failed to create email service:', error);
    return null;
  }
}

export default EmailService;
