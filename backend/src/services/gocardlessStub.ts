/**
 * GoCardless mandate stub — used when Revolut is not configured.
 * Provides a demo Direct Debit setup flow until live GoCardless credentials are added.
 */

import { v4 as uuidv4 } from 'uuid';
import logger from '../config/logger.js';

const GOCARDLESS_ACCESS_TOKEN = process.env.GOCARDLESS_ACCESS_TOKEN;

export interface GoCardlessMandateRequest {
  proposalId: string;
  reference: string;
  customer: {
    name: string;
    email: string;
    companyName?: string;
  };
  metadata?: Record<string, string>;
}

export interface GoCardlessMandateResponse {
  id: string;
  status: 'pending' | 'active' | 'failed' | 'cancelled';
  redirectUrl: string;
  reference: string;
  isStub: boolean;
}

export function isGoCardlessConfigured(): boolean {
  return !!GOCARDLESS_ACCESS_TOKEN;
}

/**
 * Create a mandate setup session.
 * When GOCARDLESS_ACCESS_TOKEN is missing, returns a stub mandate for demo/testing.
 */
export async function createMandateSetup(
  request: GoCardlessMandateRequest,
  frontendBaseUrl: string,
  shareToken: string
): Promise<GoCardlessMandateResponse> {
  const mandateId = `gc_stub_${uuidv4().replace(/-/g, '').slice(0, 16)}`;

  if (GOCARDLESS_ACCESS_TOKEN) {
    // Live GoCardless integration placeholder — wire to Billing Requests API when credentials exist
    logger.info(`GoCardless live mode not yet implemented; using stub for ${request.reference}`);
  }

  const redirectUrl = `${frontendBaseUrl.replace(/\/$/, '')}/proposals/view/${shareToken}?payment=setup&mandate=${mandateId}`;

  logger.info(`GoCardless stub mandate created: ${mandateId}, reference: ${request.reference}`);

  return {
    id: mandateId,
    status: 'pending',
    redirectUrl,
    reference: request.reference,
    isStub: true,
  };
}

/**
 * Complete a stub mandate (demo flow only).
 */
export function completeStubMandate(mandateId: string): GoCardlessMandateResponse {
  if (!mandateId.startsWith('gc_stub_')) {
    throw new Error('Only stub mandates can be completed via this endpoint');
  }

  return {
    id: mandateId,
    status: 'active',
    redirectUrl: '',
    reference: '',
    isStub: true,
  };
}