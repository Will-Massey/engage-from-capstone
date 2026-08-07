/**
 * Provider-neutral mailbox contract, consumed by Tasks 3-5.
 * Graph and Gmail clients both implement MailProviderClient against this shape.
 */

export interface MailAddress {
  address: string;
  name?: string;
}

export interface ProviderMessage {
  externalId: string;
  conversationId?: string;
  internetMessageId?: string;
  direction: 'INBOUND' | 'OUTBOUND';
  from: string; // "Name <a@b>" flattened
  to: string; // comma-separated
  cc?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  isRead: boolean;
  hasAttachments: boolean;
  receivedAt: Date;
  attachments?: {
    externalId: string;
    name: string;
    contentType: string;
    sizeBytes: number;
    isInline: boolean;
  }[];
}

export interface DeltaPage {
  messages: ProviderMessage[];
  deltaLink: string | null;
}

export interface SendSpec {
  to: string[];
  cc?: string[];
  subject: string;
  bodyText: string;
  replyToExternalId?: string; // provider message id being replied to
  inReplyToInternetMessageId?: string;
}

export interface MailProviderClient {
  syncInbox(deltaLink: string | null): Promise<DeltaPage>;
  syncSent(deltaLink: string | null): Promise<DeltaPage>;
  send(spec: SendSpec): Promise<{ externalId: string | null }>;
  markRead(externalId: string, read: boolean): Promise<void>;
  fetchAttachment(
    messageExternalId: string,
    attachmentExternalId: string
  ): Promise<{ name: string; contentType: string; content: Buffer }>;
}
