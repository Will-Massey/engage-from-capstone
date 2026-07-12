/** Xero and QuickBooks integration API types. */

export interface OAuthConnectResult {
  url: string;
  state: string;
}

export interface DisconnectIntegrationResult {
  success: true;
  message: string;
}

export type XeroSyncMode = 'repeating_draft' | 'paid_invoices';

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
  autoPushOnAcceptance?: boolean;
  xeroSyncMode?: XeroSyncMode;
  xeroPaymentAccountCode?: string;
}

export interface UpdateXeroSettingsPayload {
  autoPushOnAcceptance?: boolean;
  xeroSyncMode?: XeroSyncMode;
  xeroPaymentAccountCode?: string | null;
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
  skipped?: boolean;
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
  lastImportAt?: string;
  lastPushAt?: string;
  paymentAccountId?: string;
  provider: 'quickbooks';
  sandbox: boolean;
}

export interface ImportQuickBooksClientsPayload {
  dryRun?: boolean;
}

export interface ImportQuickBooksClientsResult {
  dryRun: boolean;
  qboCustomersFetched: number;
  created: number;
  skipped: number;
  errors: number;
  createdClients: Array<{
    name: string;
    contactEmail: string;
    qboCustomerId?: string;
  }>;
  skippedCustomers: Array<{
    name: string;
    reason: string;
    existingClientId?: string;
  }>;
  importErrors: Array<{ name: string; error: string }>;
}

export interface QuickBooksProposalPushResult {
  proposalId: string;
  reference: string;
  customerId?: string;
  invoiceId?: string;
  linesPushed: number;
  warnings: string[];
  skipped?: boolean;
}
