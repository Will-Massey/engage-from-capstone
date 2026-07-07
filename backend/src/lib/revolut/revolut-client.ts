/**
 * Revolut Merchant API client — Capstone standard.
 * @see https://developer.revolut.com/docs/api/merchant
 */

import { randomUUID } from 'crypto';

const API_VERSION = '2024-09-01';

/** CI / local e2e only — never use a real merchant secret. */
export const REVOLUT_E2E_STUB_KEY = 'e2e-stub';

export function isRevolutE2eStub(): boolean {
  return process.env.REVOLUT_API_SECRET_KEY === REVOLUT_E2E_STUB_KEY;
}

export function isRevolutConfigured(): boolean {
  return Boolean(process.env.REVOLUT_API_SECRET_KEY);
}

export function getRevolutMode(): 'sandbox' | 'prod' {
  const url = process.env.REVOLUT_API_URL || 'https://sandbox-merchant.revolut.com';
  return url.includes('sandbox') ? 'sandbox' : 'prod';
}

export function getRevolutBaseUrl(): string {
  return (process.env.REVOLUT_API_URL || 'https://sandbox-merchant.revolut.com').replace(/\/$/, '');
}

async function revolutFetch<T = Record<string, unknown>>(
  path: string,
  { method = 'GET', body }: { method?: string; body?: unknown } = {}
): Promise<T> {
  const secret = process.env.REVOLUT_API_SECRET_KEY;
  if (!secret) throw new Error('REVOLUT_API_SECRET_KEY not configured');

  const res = await fetch(`${getRevolutBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Revolut-Api-Version': API_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) {
    const msg = data.message || data.error || `Revolut API ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export interface RevolutOrderCustomer {
  email?: string;
  full_name?: string;
}

export interface RevolutOrder {
  id: string;
  token: string;
  public_id?: string;
  checkout_url?: string;
  customer?: { id?: string };
  customer_id?: string;
  metadata?: Record<string, string>;
  merchant_order_ext_ref?: string;
}

export async function createOrder({
  amount,
  currency = 'GBP',
  description,
  customer,
  merchantOrderExtRef,
  redirectUrl,
  metadata = {},
}: {
  amount: number;
  currency?: string;
  description: string;
  customer?: RevolutOrderCustomer;
  merchantOrderExtRef: string;
  redirectUrl: string;
  metadata?: Record<string, string>;
}): Promise<RevolutOrder> {
  if (isRevolutE2eStub()) {
    const id = `e2e-order-${randomUUID()}`;
    return {
      id,
      token: `e2e-checkout-${id}`,
      checkout_url: `https://sandbox-checkout.revolut.com/payment-link/${id}`,
      merchant_order_ext_ref: merchantOrderExtRef,
      metadata,
    };
  }

  return revolutFetch<RevolutOrder>('/api/orders', {
    method: 'POST',
    body: {
      amount,
      currency: currency.toUpperCase(),
      description,
      customer,
      merchant_order_ext_ref: merchantOrderExtRef,
      redirect_url: redirectUrl,
      metadata,
    },
  });
}

export async function retrieveOrder(orderId: string): Promise<RevolutOrder> {
  return revolutFetch<RevolutOrder>(`/api/orders/${orderId}`);
}
