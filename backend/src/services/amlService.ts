/**
 * AML partner scaffold — SmartSearch / Creditsafe stub (W3.3)
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

const SMARTSEARCH_API_KEY = process.env.SMARTSEARCH_API_KEY;
const CREDITSAFE_API_KEY = process.env.CREDITSAFE_API_KEY;

export function isAmlPartnerConfigured(): boolean {
  return !!(SMARTSEARCH_API_KEY || CREDITSAFE_API_KEY);
}

export function resolveAmlProvider(requested?: AmlProvider): AmlProvider {
  if (requested === 'smartsearch' && SMARTSEARCH_API_KEY) return 'smartsearch';
  if (requested === 'creditsafe' && CREDITSAFE_API_KEY) return 'creditsafe';
  if (SMARTSEARCH_API_KEY) return 'smartsearch';
  if (CREDITSAFE_API_KEY) return 'creditsafe';
  return 'stub';
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
  const ref = `${provider}_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const isStub = provider === 'stub';

  await prisma.client.update({
    where: { id: client.id },
    data: {
      amlStatus: AmlStatus.PENDING,
      amlCheckedAt: new Date(),
      amlProviderRef: ref,
      lifecycleStage: client.lifecycleStage === 'PROPOSAL_ACCEPTED' ? 'AML_PENDING' : client.lifecycleStage,
    },
  });

  await prisma.activityLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.initiatedByUserId,
      action: 'AML_CHECK_INITIATED',
      entityType: 'CLIENT',
      entityId: client.id,
      description: `AML check initiated via ${provider}`,
      metadata: JSON.stringify({ provider, amlProviderRef: ref, isStub }),
    },
  });

  const apiBase =
    process.env.API_URL ||
    process.env.BACKEND_URL ||
    `http://localhost:${process.env.PORT || 3001}`;

  if (isStub) {
    logger.info(`AML stub check created for client ${client.id}: ${ref}`);
  } else {
    logger.info(`AML live check placeholder for client ${client.id} via ${provider}`);
  }

  return {
    clientId: client.id,
    amlStatus: AmlStatus.PENDING,
    amlProviderRef: ref,
    provider,
    isStub,
    message: isStub
      ? 'AML check queued (stub mode). Results will arrive via webhook when partner credentials are configured.'
      : `AML check submitted to ${provider}. Await webhook confirmation.`,
    webhookUrl: `${apiBase}/api/aml/webhook`,
  };
}

export interface AmlWebhookPayload {
  providerRef: string;
  status: 'clear' | 'refer' | 'failed' | 'pending';
  completedAt?: string;
  details?: Record<string, unknown>;
}

/**
 * Process AML partner webhook — updates client AML fields.
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

  await prisma.client.update({
    where: { id: client.id },
    data: {
      amlStatus,
      amlCheckedAt: checkedAt,
      amlCompletedAt: amlStatus === AmlStatus.CLEAR ? checkedAt : client.amlCompletedAt,
      lifecycleStage:
        amlStatus === AmlStatus.CLEAR && client.lifecycleStage === 'AML_PENDING'
          ? 'AML_COMPLETE'
          : client.lifecycleStage,
    },
  });

  await prisma.activityLog.create({
    data: {
      tenantId: client.tenantId,
      action: 'AML_CHECK_COMPLETED',
      entityType: 'CLIENT',
      entityId: client.id,
      description: `AML check completed: ${amlStatus}`,
      metadata: JSON.stringify(payload.details ?? {}),
    },
  });

  return { updated: true, clientId: client.id, amlStatus };
}