/**
 * Minimal QuickBooks Online v3 API client (R4.1) — raw fetch, no SDK.
 * Company endpoints only; minorversion pinned. Session comes from
 * getAuthenticatedQuickBooksSession (refresh-on-read).
 */

import { getQuickBooksApiBase, type QuickBooksSession } from './quickbooksService.js';

export const QBO_MINOR_VERSION = '75';

export interface QboCustomer {
  Id?: string;
  DisplayName?: string;
  PrimaryEmailAddr?: { Address?: string };
  Active?: boolean;
}

export interface QboInvoiceLine {
  Amount: number;
  Description?: string;
  DetailType: 'SalesItemLineDetail';
  SalesItemLineDetail: {
    Qty?: number;
    UnitPrice?: number;
    ItemRef?: { value: string };
  };
}

export interface QboInvoice {
  Id?: string;
  DocNumber?: string;
  TotalAmt?: number;
}

async function qboFetch<T>(
  session: QuickBooksSession,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${getQuickBooksApiBase()}/v3/company/${session.realmId}${path}${sep}minorversion=${QBO_MINOR_VERSION}`;

  const response = await fetch(url, {
    method: init?.method || 'GET',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: 'application/json',
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `QuickBooks API ${init?.method || 'GET'} ${path} failed (${response.status}): ${detail.slice(0, 300)}`
    );
  }

  return (await response.json()) as T;
}

/** Fetch all customers (paginated via STARTPOSITION). */
export async function queryCustomers(session: QuickBooksSession): Promise<QboCustomer[]> {
  const all: QboCustomer[] = [];
  const pageSize = 500;
  let startPosition = 1;

  for (;;) {
    const query = `select * from Customer startposition ${startPosition} maxresults ${pageSize}`;
    const result = await qboFetch<{ QueryResponse?: { Customer?: QboCustomer[] } }>(
      session,
      `/query?query=${encodeURIComponent(query)}`
    );
    const customers = result.QueryResponse?.Customer || [];
    all.push(...customers);
    if (customers.length < pageSize) break;
    startPosition += pageSize;
    if (startPosition > 25_000) break;
  }

  return all;
}

/** Escape a value for the QBO query grammar (single quotes). */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function queryOneCustomer(
  session: QuickBooksSession,
  whereClause: string
): Promise<QboCustomer | null> {
  const query = `select * from Customer where ${whereClause} maxresults 5`;
  const result = await qboFetch<{ QueryResponse?: { Customer?: QboCustomer[] } }>(
    session,
    `/query?query=${encodeURIComponent(query)}`
  );
  return result.QueryResponse?.Customer?.[0] ?? null;
}

export async function findCustomerByEmail(
  session: QuickBooksSession,
  email: string
): Promise<QboCustomer | null> {
  return queryOneCustomer(session, `PrimaryEmailAddr = '${escapeQueryValue(email)}'`);
}

export async function findCustomerByName(
  session: QuickBooksSession,
  name: string
): Promise<QboCustomer | null> {
  return queryOneCustomer(session, `DisplayName = '${escapeQueryValue(name)}'`);
}

export async function createCustomer(
  session: QuickBooksSession,
  args: { displayName: string; email?: string }
): Promise<QboCustomer> {
  const result = await qboFetch<{ Customer?: QboCustomer }>(session, '/customer', {
    method: 'POST',
    body: {
      DisplayName: args.displayName,
      ...(args.email ? { PrimaryEmailAddr: { Address: args.email } } : {}),
    },
  });
  if (!result.Customer?.Id) {
    throw new Error('QuickBooks customer creation returned no Id');
  }
  return result.Customer;
}

/**
 * Create an invoice for a customer. Line amounts are GBP gross (VAT-inclusive
 * as collected) with GlobalTaxCalculation NotApplicable, so the QBO invoice
 * total always equals the money actually collected.
 */
export async function createInvoice(
  session: QuickBooksSession,
  args: {
    customerId: string;
    docNumber?: string;
    privateNote?: string;
    lines: Array<{ description: string; amount: number }>;
  }
): Promise<QboInvoice> {
  const result = await qboFetch<{ Invoice?: QboInvoice }>(session, '/invoice', {
    method: 'POST',
    body: {
      CustomerRef: { value: args.customerId },
      GlobalTaxCalculation: 'NotApplicable',
      ...(args.docNumber ? { DocNumber: args.docNumber.slice(0, 21) } : {}),
      ...(args.privateNote ? { PrivateNote: args.privateNote } : {}),
      Line: args.lines.map(
        (l): QboInvoiceLine => ({
          Amount: l.amount,
          Description: l.description,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: { Qty: 1, UnitPrice: l.amount },
        })
      ),
    },
  });
  if (!result.Invoice?.Id) {
    throw new Error('QuickBooks invoice creation returned no Id');
  }
  return result.Invoice;
}

/** Record a payment against an invoice (Stripe already collected the money). */
export async function createPayment(
  session: QuickBooksSession,
  args: { customerId: string; invoiceId: string; amount: number; depositAccountId?: string }
): Promise<void> {
  await qboFetch(session, '/payment', {
    method: 'POST',
    body: {
      CustomerRef: { value: args.customerId },
      TotalAmt: args.amount,
      ...(args.depositAccountId ? { DepositToAccountRef: { value: args.depositAccountId } } : {}),
      Line: [
        {
          Amount: args.amount,
          LinkedTxn: [{ TxnId: args.invoiceId, TxnType: 'Invoice' }],
        },
      ],
    },
  });
}
