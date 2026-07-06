/**
 * AML partner integration — SmartSearch / Creditsafe with stub fallback (W3.3)
 */

import { v4 as uuidv4 } from 'uuid';
import { AmlStatus } from '@prisma/client';
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

export type AmlProvider = 'smartsearch' | 'creditsafe' | 'stub';

export interface AmlCheckRequest {
  tenantId: string;
  clientId: string;
  provider?: AmlProvider;
  initiatedByUserId?: string;
}

export interface AmlCheckResult {
  clientId: string;
  amlStatus: AmlStatus;
  amlProviderRef: string;
  provider: AmlProvider;
  isStub: boolean;
  message: string;
  webhookUrl: string;
}

export interface AmlClientStatus {
  clientId: string;
  amlStatus: AmlStatus;
  amlProviderRef: string | null;
  amlCheckedAt: string | null;
  amlCompletedAt: string | null;
  amlSubmittedAt: string | null;
  lifecycleStage: string;
  provider: AmlProvider | null;
  mode: 'live' | 'demo';
  lastCheckMessage: string | null;
  partnerConfigured: boolean;
}

export interface AmlPartnerConfig {
  mode: 'live' | 'demo';
  partnerConfigured: boolean;
  availableProviders: AmlProvider[];
  smartsearchConfigured: boolean;
  creditsafeConfigured: boolean;
}

export interface AmlWebhookPayload {
  providerRef: string;
  status: 'clear' | 'refer' | 'failed' | 'pending';
  completedAt?: string;
  details?: Record<string, unknown>;
}

const SMARTSEARCH_API_KEY = process.env.SMARTSEARCH_API_KEY;
const CREDITSAFE_API_KEY = process.env.CREDITSAFE_API_KEY;
const SMARTSEARCH_API_URL =
  process.env.SMARTSEARCH_API_URL ||
  (process.env.SMARTSEARCH_SANDBOX === 'false'
    ? 'https://api.smartsearch.com'
    : 'https://sandbox-api.smartsearch.com');
const CREDITSAFE_API_URL =
  process.env.CREDITSAFE_API_URL || 'https://connect.sandbox.creditsafe.com/v1';

class AmlPartnerApiError extends Error {
  constructor(
    message: string,
    public readonly provider: AmlProvider,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'AmlPartnerApiError';
  }
}

function getApiBase(): string {
  return (
    process.env.API_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`
  );
}

export function isAmlPartnerConfigured(): boolean {
  return !!(SMARTSEARCH_API_KEY || CREDITSAFE_API_KEY);
}

export function getAmlPartnerConfig(): AmlPartnerConfig {
  const smartsearchConfigured = !!SMARTSEARCH_API_KEY;
  const creditsafeConfigured = !!CREDITSAFE_API_KEY;
  const partnerConfigured = smartsearchConfigured || creditsafeConfigured;
  const availableProviders: AmlProvider[] = [];
  if (smartsearchConfigured) availableProviders.push('smartsearch');
  if (creditsafeConfigured) availableProviders.push('creditsafe');
  if (!partnerConfigured) availableProviders.push('stub');

  return {
    mode: partnerConfigured ? 'live' : 'demo',
    partnerConfigured,
    availableProviders,
    smartsearchConfigured,
    creditsafeConfigured,
  };
}

export function resolveAmlProvider(requested?: AmlProvider): AmlProvider {
  if (requested === 'stub') return 'stub';
  if (requested === 'smartsearch' && SMARTSEARCH_API_KEY) return 'smartsearch';
  if (requested === 'creditsafe' && CREDITSAFE_API_KEY) return 'creditsafe';
  if (SMARTSEARCH_API_KEY) return 'smartsearch';
  if (CREDITSAFE_API_KEY) return 'creditsafe';
  return 'stub';
}

function inferProviderFromRef(ref: string | null | undefined): AmlProvider | null {
  if (!ref) return null;
  if (ref.startsWith('smartsearch_')) return 'smartsearch';
  if (ref.startsWith('creditsafe_')) return 'creditsafe';
  if (ref.startsWith('stub_')) return 'stub';
  return null;
}

function splitName(fullName: string): { forename: string; surname: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { forename: parts[0], surname: parts[0] };
  return { forename: parts[0], surname: parts.slice(1).join(' ') };
}

function parseAmlSubmission(client: {
  amlSubmissionData: string | null;
  contactName: string | null;
  name: string;
}) {
  if (!client.amlSubmissionData) {
    return {
      fullLegalName: client.contactName || client.name,
      dateOfBirth: undefined as string | undefined,
      registeredAddress: undefined as string | undefined,
      nationality: undefined as string | undefined,
    };
  }
  try {
    const data = JSON.parse(client.amlSubmissionData) as Record<string, string>;
    return {
      fullLegalName: data.fullLegalName || client.contactName || client.name,
      dateOfBirth: data.dateOfBirth,
      registeredAddress: data.registeredAddress,
      nationality: data.nationality,
    };
  } catch {
    return {
      fullLegalName: client.contactName || client.name,
      dateOfBirth: undefined,
      registeredAddress: undefined,
      nationality: undefined,
    };
  }
}

async function submitSmartSearchCheck(params: {
  ref: string;
  client: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    amlSubmissionData: string | null;
  };
  webhookUrl: string;
}): Promise<{ providerRef: string; message: string }> {
  const submission = parseAmlSubmission(params.client);
  const { forename, surname } = splitName(submission.fullLegalName);

  const body = {
    reference: params.ref,
    callback_url: params.webhookUrl,
    individual: {
      forename,
      surname,
      date_of_birth: submission.dateOfBirth,
      address: submission.registeredAddress,
      nationality: submission.nationality,
      email: params.client.contactEmail,
    },
    metadata: {
      client_id: params.client.id,
      client_name: params.client.name,
    },
  };

  const response = await fetch(`${SMARTSEARCH_API_URL}/v2/identity-verifications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SMARTSEARCH_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Request-Id': params.ref,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw: responseText.slice(0, 500) };
  }

  if (!response.ok) {
    const detail =
      (parsed.message as string) ||
      (parsed.error as string) ||
      `SmartSearch API returned ${response.status}`;
    throw new AmlPartnerApiError(detail, 'smartsearch', response.status);
  }

  const providerRef =
    (parsed.id as string) ||
    (parsed.reference as string) ||
    ((parsed.data as Record<string, unknown> | undefined)?.id as string) ||
    params.ref;

  return {
    providerRef: String(providerRef),
    message: 'AML check submitted to SmartSearch. Await webhook confirmation.',
  };
}

async function submitCreditsafeCheck(params: {
  ref: string;
  client: {
    id: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    amlSubmissionData: string | null;
  };
  webhookUrl: string;
}): Promise<{ providerRef: string; message: string }> {
  const submission = parseAmlSubmission(params.client);
  const { forename, surname } = splitName(submission.fullLegalName);

  const body = {
    reference: params.ref,
    webhookUrl: params.webhookUrl,
    person: {
      firstName: forename,
      lastName: surname,
      dateOfBirth: submission.dateOfBirth,
      address: submission.registeredAddress,
      nationality: submission.nationality,
      email: params.client.contactEmail,
    },
    externalReference: params.client.id,
  };

  const response = await fetch(`${CREDITSAFE_API_URL}/compliance/aml-checks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CREDITSAFE_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = responseText ? (JSON.parse(responseText) as Record<string, unknown>) : {};
  } catch {
    parsed = { raw: responseText.slice(0, 500) };
  }

  if (!response.ok) {
    const detail =
      (parsed.message as string) ||
      (parsed.error as string) ||
      `Creditsafe API returned ${response.status}`;
    throw new AmlPartnerApiError(detail, 'creditsafe', response.status);
  }

  const providerRef =
    (parsed.checkId as string) ||
    (parsed.id as string) ||
    ((parsed.data as Record<string, unknown> | undefined)?.checkId as string) ||
    params.ref;

  return {
    providerRef: String(providerRef),
    message: 'AML check submitted to Creditsafe. Await webhook confirmation.',
  };
}

/**
 * Initiate an AML check — stores PENDING on client and returns provider reference.
 */
export async function initiateAmlCheck(input: AmlCheckRequest): Promise<AmlCheckResult> {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, tenantId: input.tenantId, isActive: true },
  });

  if (!client) {
    throw new Error('Client not found');
  }

  const provider = resolveAmlProvider(input.provider);
  const localRef = `${provider}_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const isStub = provider === 'stub';
  const apiBase = getApiBase();
  const webhookUrl = `${apiBase}/api/aml/webhook`;

  let providerRef = localRef;
  let message = isStub
    ? 'AML check queued (demo mode). Configure SMARTSEARCH_API_KEY or CREDITSAFE_API_KEY for live checks.'
    : `AML check submitted to ${provider}. Await webhook confirmation.`;

  if (!isStub) {
    try {
      const result =
        provider === 'smartsearch'
          ? await submitSmartSearchCheck({ ref: localRef, client, webhookUrl })
          : await submitCreditsafeCheck({ ref: localRef, client, webhookUrl });
      providerRef = result.providerRef;
      message = result.message;
    } catch (err) {
      const msg =
        err instanceof AmlPartnerApiError
          ? `${err.provider} API error: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'AML partner API request failed';
      logger.error(`AML live check failed for client ${client.id} via ${provider}`, err);
      throw new Error(msg);
    }
  } else {
    logger.info(`AML stub check created for client ${client.id}: ${providerRef}`);
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      amlStatus: AmlStatus.PENDING,
      amlCheckedAt: new Date(),
      amlProviderRef: providerRef,
      lifecycleStage:
        client.lifecycleStage === 'PROPOSAL_ACCEPTED' ? 'AML_PENDING' : client.lifecycleStage,
    },
  });

  await prisma.activityLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.initiatedByUserId,
      action: 'AML_CHECK_INITIATED',
      entityType: 'CLIENT',
      entityId: client.id,
      description: `AML check initiated via ${provider}${isStub ? ' (demo)' : ''}`,
      metadata: JSON.stringify({ provider, amlProviderRef: providerRef, isStub }),
    },
  });

  if (!isStub) {
    logger.info(`AML live check submitted for client ${client.id} via ${provider}: ${providerRef}`);
  }

  return {
    clientId: client.id,
    amlStatus: AmlStatus.PENDING,
    amlProviderRef: providerRef,
    provider,
    isStub,
    message,
    webhookUrl,
  };
}

/**
 * Staff panel: current AML status for a client.
 */
export async function getAmlStatusForClient(
  tenantId: string,
  clientId: string
): Promise<AmlClientStatus> {
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId, isActive: true },
    select: {
      id: true,
      amlStatus: true,
      amlProviderRef: true,
      amlCheckedAt: true,
      amlCompletedAt: true,
      amlSubmittedAt: true,
      lifecycleStage: true,
    },
  });

  if (!client) {
    throw new Error('Client not found');
  }

  const config = getAmlPartnerConfig();
  const provider = inferProviderFromRef(client.amlProviderRef);
  const isStub = !provider || provider === 'stub' || !config.partnerConfigured;

  let lastCheckMessage: string | null = null;
  switch (client.amlStatus) {
    case AmlStatus.CLEAR:
      lastCheckMessage = 'Last check: Clear';
      break;
    case AmlStatus.REFER:
      lastCheckMessage = 'Last check: Refer — manual review required';
      break;
    case AmlStatus.FAILED:
      lastCheckMessage = 'Last check: Failed';
      break;
    case AmlStatus.PENDING:
      lastCheckMessage = client.amlProviderRef ? 'Last check: Pending partner response' : null;
      break;
    default:
      lastCheckMessage = client.amlSubmittedAt
        ? 'Client submitted ID details — check not yet run'
        : null;
  }

  return {
    clientId: client.id,
    amlStatus: client.amlStatus,
    amlProviderRef: client.amlProviderRef,
    amlCheckedAt: client.amlCheckedAt?.toISOString() ?? null,
    amlCompletedAt: client.amlCompletedAt?.toISOString() ?? null,
    amlSubmittedAt: client.amlSubmittedAt?.toISOString() ?? null,
    lifecycleStage: client.lifecycleStage,
    provider,
    mode: isStub ? 'demo' : 'live',
    lastCheckMessage,
    partnerConfigured: config.partnerConfigured,
  };
}

/**
 * Process AML partner webhook — updates client AML fields and lifecycle stage.
 */
export async function processAmlWebhook(payload: AmlWebhookPayload): Promise<{
  updated: boolean;
  clientId?: string;
  amlStatus?: AmlStatus;
}> {
  const statusMap: Record<string, AmlStatus> = {
    clear: AmlStatus.CLEAR,
    refer: AmlStatus.REFER,
    failed: AmlStatus.FAILED,
    pending: AmlStatus.PENDING,
  };

  const amlStatus = statusMap[payload.status] ?? AmlStatus.PENDING;

  const client = await prisma.client.findFirst({
    where: { amlProviderRef: payload.providerRef },
  });

  if (!client) {
    logger.warn(`AML webhook: unknown providerRef ${payload.providerRef}`);
    return { updated: false };
  }

  const checkedAt = payload.completedAt ? new Date(payload.completedAt) : new Date();
  const isClear = amlStatus === AmlStatus.CLEAR;

  let lifecycleStage = client.lifecycleStage;
  if (isClear && client.lifecycleStage === 'AML_PENDING') {
    lifecycleStage = 'AML_COMPLETE';
  } else if (
    (amlStatus === AmlStatus.REFER || amlStatus === AmlStatus.FAILED) &&
    client.lifecycleStage === 'PROPOSAL_ACCEPTED'
  ) {
    lifecycleStage = 'AML_PENDING';
  }

  await prisma.client.update({
    where: { id: client.id },
    data: {
      amlStatus,
      amlCheckedAt: checkedAt,
      amlCompletedAt: isClear ? checkedAt : client.amlCompletedAt,
      lifecycleStage,
    },
  });

  await prisma.activityLog.create({
    data: {
      tenantId: client.tenantId,
      action: 'AML_CHECK_COMPLETED',
      entityType: 'CLIENT',
      entityId: client.id,
      description: `AML check completed: ${amlStatus}`,
      metadata: JSON.stringify({
        providerRef: payload.providerRef,
        status: payload.status,
        details: payload.details ?? {},
      }),
    },
  });

  logger.info(`AML webhook processed for client ${client.id}: ${amlStatus}`);

  return { updated: true, clientId: client.id, amlStatus };
}
