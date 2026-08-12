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
  replyTo?: string;
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
  private initPromise: Promise<void>;

  constructor(config: EmailConfig) {
    this.config = config;
    this.initPromise = this.initializeTransporter();
  }

  /** Create service and wait until transporter is ready */
  static async createReady(config: EmailConfig): Promise<EmailService> {
    const svc = new EmailService(config);
    await svc.ensureReady();
    return svc;
  }

  async ensureReady(): Promise<void> {
    await this.initPromise;
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
      tls:
        process.env.NODE_ENV === 'production'
          ? {
              rejectUnauthorized: true,
            }
          : undefined,
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

  /**
   * Microsoft 365 sends over Graph, not SMTP.
   *
   * The mailbox connect consents to Graph scopes, so an SMTP token exchange
   * asks for a resource the grant never covered; and smtp.office365.com is
   * disabled by default in modern tenants regardless. There is no transport to
   * build here — sendViaGraph mints a token per send.
   */
  private async initializeOutlook(): Promise<void> {
    if (!this.config.outlook) {
      throw new Error('Outlook configuration required');
    }
  }

  private async getOutlookAccessToken(): Promise<string> {
    const { clientId, clientSecret, refreshToken } = this.config.outlook ?? {};
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'Outlook email is not fully configured (clientId, clientSecret and refreshToken are all required)'
      );
    }
    try {
      // Use Microsoft Graph token endpoint
      const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Mail.Send offline_access',
        }),
      });

      if (!response.ok) {
        throw new Error(`Outlook token refresh failed: ${response.statusText}`);
      }

      const data = (await response.json()) as any;
      return data.access_token;
    } catch (error) {
      logger.error('Failed to get Outlook access token:', error);
      throw error;
    }
  }

  /**
   * Send through Microsoft Graph using the mailbox grant we already hold.
   * Attachments ride inline as fileAttachment, which Graph accepts up to a ~4MB
   * request; anything larger fails the send and tenantMailerSend falls back to
   * the platform transport.
   */
  private async sendViaGraph(
    message: EmailMessage
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const token = await this.getOutlookAccessToken();
    const toList = (value?: string | string[]) =>
      (Array.isArray(value) ? value : value ? [value] : []).map((address) => ({
        emailAddress: { address },
      }));

    const attachments = (message.attachments || []).map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: Buffer.isBuffer(a.content)
        ? a.content.toString('base64')
        : Buffer.from(a.content).toString('base64'),
    }));

    const graphMessage: Record<string, unknown> = {
      subject: message.subject,
      body: message.html
        ? { contentType: 'HTML', content: message.html }
        : { contentType: 'Text', content: message.text || '' },
      toRecipients: toList(message.to),
      ccRecipients: toList(message.cc),
      bccRecipients: toList(message.bcc),
    };
    if (message.replyTo) {
      graphMessage.replyTo = toList(message.replyTo);
    }
    if (attachments.length) {
      graphMessage.attachments = attachments;
    }

    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: graphMessage }),
    });

    if (!res.ok) {
      throw new Error(`Graph sendMail failed: ${res.status} ${res.statusText}`);
    }

    // Graph 202s with an empty body; there is no message id to report.
    return { success: true };
  }

  async sendEmail(
    message: EmailMessage
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      await this.ensureReady();

      if (this.config.provider === 'outlook' || this.config.provider === 'microsoft365') {
        return await this.sendViaGraph(message);
      }

      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      // Refresh token if needed for OAuth providers
      if (this.config.provider === 'gmail') {
        await this.refreshAccessToken();
      }

      const info = await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.fromEmail}>`,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        replyTo: message.replyTo,
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

      // Outlook/Microsoft 365 no longer reach here — they send over Graph and
      // mint their own token per send, with no transporter auth to update.
      if (this.config.provider === 'gmail') {
        accessToken = await this.getGmailAccessToken();
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

    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
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

  async sendAcceptanceNotification(params: {
    to: string;
    clientName: string;
    proposalTitle: string;
    proposalReference: string;
    acceptedAt: Date;
    totalAmount: string;
    signedBy: string;
    signedByRole: string;
    proposalPdf: Buffer;
    signaturePng?: Buffer;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const { generateAcceptanceNotification } =
      await import('../templates/acceptanceNotification.js');

    const { html, text, subject } = generateAcceptanceNotification({
      clientName: params.clientName,
      proposalTitle: params.proposalTitle,
      proposalReference: params.proposalReference,
      acceptedAt: params.acceptedAt,
      totalAmount: params.totalAmount,
      signedBy: params.signedBy,
      signedByRole: params.signedByRole,
    });

    const attachments = [
      {
        filename: `Proposal_${params.proposalReference}_Signed.pdf`,
        content: params.proposalPdf,
        contentType: 'application/pdf',
      },
    ];

    if (params.signaturePng) {
      attachments.push({
        filename: `Signature_${params.proposalReference}.png`,
        content: params.signaturePng,
        contentType: 'image/png',
      });
    }

    return this.sendEmail({
      to: params.to,
      subject,
      html,
      text,
      attachments,
    });
  }

  async verifyConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureReady();

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
  static generateGmailAuthUrl(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    state?: string
  ): string {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      // Full mailbox: read (two-way inbox) + send
      scope: [
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      prompt: 'consent',
      ...(state ? { state } : {}),
    });
  }

  // Exchange Gmail code for tokens
  static async exchangeGmailCode(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    code: string
  ): Promise<{ refreshToken: string; accessToken: string; user?: string }> {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      throw new Error(
        'No refresh token received. User may need to re-authorize with prompt=consent'
      );
    }

    // The auth URL requests userinfo.email, so Google returns an id_token
    // carrying the mailbox address. It was previously discarded, which left the
    // caller with no address at all — see saveOAuthTokens for why guessing one
    // is worse than having none.
    let user: string | undefined;
    try {
      if (tokens.id_token) {
        user = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString())
          .email as string;
      }
    } catch {
      user = undefined;
    }

    return {
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token || '',
      user,
    };
  }

  // Generate Microsoft OAuth2 URL for setup
  static generateMicrosoftAuthUrl(
    clientId: string,
    redirectUri: string,
    tenantId?: string,
    state?: string
  ): string {
    // Graph Mail.Read + Mail.Send for two-way mailbox (not SMTP.Send alone)
    const scopes = ['offline_access', 'User.Read', 'Mail.Read', 'Mail.Send', 'Mail.ReadWrite'];

    const tenant = tenantId || 'common';

    return (
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?` +
      `client_id=${encodeURIComponent(clientId)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes.join(' '))}` +
      `&prompt=consent` +
      (state ? `&state=${encodeURIComponent(state)}` : '')
    );
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

    const data = (await response.json()) as any;

    // The mailbox address must come from the mailbox. The auth URL does not
    // request `openid`, so Microsoft returns no id_token and the claim below is
    // almost always absent — Graph /me is the reliable source, and User.Read is
    // already in the requested scopes so it needs no extra consent. If both
    // fail we return undefined: an unknown address is safe, a guessed one is
    // not (see saveOAuthTokens).
    const fromIdToken = data.id_token
      ? JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64').toString()).email
      : undefined;

    return {
      refreshToken: data.refresh_token,
      accessToken: data.access_token,
      user: (await resolveGraphMailboxAddress(data.access_token)) || fromIdToken,
    };
  }
}

/**
 * Ask Graph which mailbox this token belongs to. `mail` is the SMTP address and
 * is what we want; `userPrincipalName` is the sign-in name and is the right
 * second choice. Never throws — a failed lookup means "unknown", not "broken
 * connect", because the mailbox syncs perfectly well without a stored address.
 */
async function resolveGraphMailboxAddress(
  accessToken: string | undefined
): Promise<string | undefined> {
  if (!accessToken) return undefined;
  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const me = (await res.json()) as { mail?: string; userPrincipalName?: string };
    return me.mail || me.userPrincipalName || undefined;
  } catch {
    return undefined;
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
