/** Xero and QuickBooks integration API types. */

export interface OAuthConnectResult {
  url: string;
  state: string;
}

export interface DisconnectIntegrationResult {
  success: true;
  message: string;
}

export interface XeroStatusResult {
  connected: boolean;
  configured: boolean;
  xeroTenantId?: string;
  xeroTenantName?: string;
  connectedAt?: string;
  lastImportAt?: string;
  lastPushAt?: string;
  scope?: string[];
  redirectUri: string;
  scopes: string[];
}

export interface ImportXeroClientsPayload {
  dryRun?: boolean;
}

export interface ImportXeroClientsResult {
  dryRun: boolean;
  xeroContactsFetched: number;
  created: number;
  skipped: number;
  errors: number;
  createdClients: Array<{
    name: string;
    contactEmail: string;
    xeroContactId?: string;
  }>;
  skippedContacts: Array<{
    name: string;
    reason: string;
    existingClientId?: string;
  }>;
  importErrors: Array<{ name: string; error: string }>;
}

export interface XeroProposalPushResult {
  proposalId: string;
  reference: string;
  mode: 'live' | 'stub';
  xero: {
    contactNote: {
      implemented: boolean;
      contactId?: string;
      updated: boolean;
      error?: string;
    };
    repeatingInvoice: {
      implemented: boolean;
      stub: boolean;
      created: number;
      repeatingInvoiceIds: string[];
      drafts: unknown[];
      errors: string[];
      message: string;
    };
  };
  warnings: string[];
}

export interface QuickBooksStatusResult {
  connected: boolean;
  configured: boolean;
  realmId?: string;
  companyName?: string;
  connectedAt?: string;
  provider: 'quickbooks';
  sandbox: boolean;
  scaffold: true;
  note: string;
}
