/**
 * Revolut Business API — agency payout after client proposal payment.
 * @see https://developer.revolut.com/docs/api/business
 */

const BUSINESS_API_VERSION = '2024-05-01';

export function isBusinessApiConfigured(): boolean {
  return Boolean(process.env.REVOLUT_BUSINESS_API_KEY && process.env.REVOLUT_BUSINESS_API_URL);
}

function getBusinessBaseUrl(): string {
  return (process.env.REVOLUT_BUSINESS_API_URL || 'https://sandbox-b2b.revolut.com').replace(/\/$/, '');
}

async function businessFetch<T = Record<string, unknown>>(
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  const key = process.env.REVOLUT_BUSINESS_API_KEY;
  if (!key) throw new Error('REVOLUT_BUSINESS_API_KEY not configured');

  const res = await fetch(`${getBusinessBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Revolut-Api-Version': BUSINESS_API_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) {
    throw new Error(data.message || `Revolut Business API ${res.status}`);
  }
  return data;
}

/**
 * Transfer agency share to the tenant's configured Revolut counterparty.
 * Set ENGAGE_AGENCY_COUNTERPARTY_ID per tenant in settings JSON, or use
 * ENGAGE_DEFAULT_AGENCY_COUNTERPARTY_ID as a global fallback for sandbox.
 */
export async function transferToAgency({
  tenantId,
  amountPence,
  reference,
  revolutOrderId,
}: {
  tenantId: string;
  amountPence: number;
  reference: string;
  revolutOrderId: string;
}): Promise<{ id: string } | null> {
  if (!isBusinessApiConfigured() || amountPence <= 0) return null;

  const { prisma } = await import('../../config/database.js');
  const [payoutSettings, tenant] = await Promise.all([
    prisma.tenantPayoutSettings.findUnique({
      where: { tenantId },
      select: { revolutCounterpartyId: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    }),
  ]);

  let counterpartyId =
    payoutSettings?.revolutCounterpartyId ||
    process.env.ENGAGE_DEFAULT_AGENCY_COUNTERPARTY_ID ||
    '';

  if (!counterpartyId && tenant?.settings) {
    try {
      const settings = JSON.parse(tenant.settings) as { revolutCounterpartyId?: string };
      if (settings.revolutCounterpartyId) {
        counterpartyId = settings.revolutCounterpartyId;
      }
    } catch {
      // ignore malformed settings
    }
  }

  if (!counterpartyId) {
    return null;
  }

  const accountId = process.env.REVOLUT_BUSINESS_ACCOUNT_ID;
  if (!accountId) {
    throw new Error('REVOLUT_BUSINESS_ACCOUNT_ID not configured');
  }

  const result = await businessFetch<{ id: string }>('/transfer', {
    method: 'POST',
    body: {
      request_id: `engage-${revolutOrderId}`,
      account_id: accountId,
      receiver: { counterparty_id: counterpartyId },
      amount: amountPence / 100,
      currency: 'GBP',
      reference,
    },
  });

  return result;
}

/** Create a Revolut Business counterparty from UK bank details (payout destination). */
export async function createCounterpartyFromBankDetails({
  companyName,
  sortCode,
  accountNumber,
}: {
  companyName: string;
  sortCode: string;
  accountNumber: string;
}): Promise<string> {
  if (!isBusinessApiConfigured()) {
    throw new Error('Revolut Business API is not configured');
  }

  const result = await businessFetch<{ id: string }>('/counterparty', {
    method: 'POST',
    body: {
      company_name: companyName,
      bank_country: 'GB',
      currency: 'GBP',
      account_no: accountNumber,
      sort_code: sortCode,
    },
  });

  if (!result?.id) {
    throw new Error('Failed to create Revolut counterparty for payout');
  }

  return result.id;
}