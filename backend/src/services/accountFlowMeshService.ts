/**
 * Capstone Engage ↔ AccountFlow mesh (federated).
 *
 * SAFETY: Default mode is `mock` — never calls production AccountFlow.
 * - mock:  in-process store + deep links to Engage sandbox UI
 * - local: HTTP to ACCOUNTFLOW_BASE_URL (must be localhost / private — blocked otherwise)
 * - live:  requires ACCOUNTFLOW_MESH_ALLOW_LIVE=true AND non-local URL (explicit only)
 *
 * Production AccountFlow is never touched unless William enables live deliberately.
 */
import { randomUUID } from 'crypto';
import { prisma } from '../config/database.js';
import logger from '../utils/logger.js';
import {
  getAccountFlowMeshSettings,
  type AccountFlowMeshSettings,
  type MeshMode,
} from '../utils/tenantAccountFlowMesh.js';

export type { MeshMode };

export interface MeshStatus {
  mode: MeshMode;
  available: boolean;
  message: string;
  accountFlowBaseUrl: string | null;
  allowLive: boolean;
  autoHandoff?: boolean;
  ssoEnabled?: boolean;
  hasApiKey?: boolean;
  source?: 'tenant' | 'env' | 'default';
}

interface MeshRuntime extends AccountFlowMeshSettings {
  source: 'tenant' | 'env' | 'default';
}

export interface HandoffResult {
  available: boolean;
  mode: MeshMode;
  status: string;
  message: string;
  deepLink: string | null;
  accountFlowClientId: string | null;
  accountFlowWorkId: string | null;
  capstoneClientId: string | null;
  jobId?: string | null;
  proposalId?: string | null;
}

interface MockAfClient {
  id: string;
  name: string;
  contactEmail: string;
  companyNumber?: string | null;
  engageClientId: string;
  tenantId: string;
  createdAt: string;
}

interface MockAfWork {
  id: string;
  title: string;
  status: string;
  clientId: string;
  engageJobId: string | null;
  engageProposalId: string | null;
  tenantId: string;
  createdAt: string;
}

/** Process-local mock AF — survives until process restart (practice sandbox). */
const mockClients = new Map<string, MockAfClient>();
const mockWork = new Map<string, MockAfWork>();
const mockClientsByEngageId = new Map<string, string>(); // engageClientId → afClientId

function isPrivateBase(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '::1' ||
      h.endsWith('.local') ||
      h.startsWith('10.') ||
      h.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
    );
  } catch {
    return false;
  }
}

function envAllowsLive(): boolean {
  return process.env.ACCOUNTFLOW_MESH_ALLOW_LIVE === 'true';
}

async function loadRuntime(tenantId?: string | null): Promise<MeshRuntime> {
  let settingsJson: string | null = null;
  let source: MeshRuntime['source'] = 'default';
  if (tenantId) {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    settingsJson = t?.settings ?? null;
    if (settingsJson && settingsJson !== '{}') source = 'tenant';
  }
  const s = getAccountFlowMeshSettings(settingsJson);
  if (!settingsJson && (process.env.ACCOUNTFLOW_MESH_MODE || process.env.ACCOUNTFLOW_BASE_URL)) {
    source = 'env';
  }
  return { ...s, source };
}

function statusFromRuntime(rt: MeshRuntime): MeshStatus {
  let mode = rt.mode;
  const url = rt.baseUrl;
  const allowLive = rt.allowLive || envAllowsLive();

  if (mode === 'off') {
    return {
      mode,
      available: false,
      message: 'AccountFlow mesh disabled for this practice.',
      accountFlowBaseUrl: url,
      allowLive,
      autoHandoff: rt.autoHandoff,
      ssoEnabled: rt.ssoEnabled,
      hasApiKey: !!rt.apiKey,
      source: rt.source,
    };
  }
  if (mode === 'live' && !allowLive) {
    return {
      mode: 'mock',
      available: true,
      message:
        'Live mesh requested but live is not allowed — enable allowLive on the practice (and ACCOUNTFLOW_MESH_ALLOW_LIVE on the server for non-private URLs). Mock only.',
      accountFlowBaseUrl: null,
      allowLive: false,
      autoHandoff: rt.autoHandoff,
      ssoEnabled: rt.ssoEnabled,
      hasApiKey: !!rt.apiKey,
      source: rt.source,
    };
  }
  if ((mode === 'local' || mode === 'live') && !url) {
    return {
      mode: 'mock',
      available: true,
      message: `${mode} mode needs AccountFlow base URL — falling back to mock.`,
      accountFlowBaseUrl: null,
      allowLive,
      autoHandoff: rt.autoHandoff,
      ssoEnabled: rt.ssoEnabled,
      hasApiKey: !!rt.apiKey,
      source: rt.source,
    };
  }
  if (mode === 'local' && url && !isPrivateBase(url)) {
    return {
      mode: 'mock',
      available: true,
      message: 'local mode refused non-private AccountFlow URL — mock active.',
      accountFlowBaseUrl: null,
      allowLive: false,
      autoHandoff: rt.autoHandoff,
      ssoEnabled: rt.ssoEnabled,
      hasApiKey: !!rt.apiKey,
      source: rt.source,
    };
  }
  // Non-private live requires env kill-switch OR tenant allowLive (practice connect)
  if (mode === 'live' && url && !isPrivateBase(url) && !envAllowsLive() && !rt.allowLive) {
    mode = 'mock';
  }
  const effective = mode;
  return {
    mode: effective,
    available: true,
    message:
      effective === 'mock'
        ? 'Mock AccountFlow mesh — no outbound calls to production AccountFlow.'
        : `AccountFlow mesh mode=${effective} base=${url}`,
    accountFlowBaseUrl: effective === 'mock' ? null : url,
    allowLive,
    autoHandoff: rt.autoHandoff,
    ssoEnabled: rt.ssoEnabled,
    hasApiKey: !!rt.apiKey,
    source: rt.source,
  };
}

/** Env-only status (legacy callers). Prefer getMeshStatusForTenant. */
export function getMeshStatus(): MeshStatus {
  const s = getAccountFlowMeshSettings(null);
  return statusFromRuntime({ ...s, source: 'env' });
}

export async function getMeshStatusForTenant(tenantId: string): Promise<MeshStatus> {
  return statusFromRuntime(await loadRuntime(tenantId));
}

function ensureCapstoneClientId(existing: string | null | undefined): string {
  return existing || `ccid_${randomUUID().replace(/-/g, '')}`;
}

/** Mock / local sandbox link — never hits production AccountFlow */
async function linkClientMock(params: {
  tenantId: string;
  clientId: string;
}): Promise<{ capstoneClientId: string; accountFlowClientId: string }> {
  const client = await prisma.client.findFirst({
    where: { id: params.clientId, tenantId: params.tenantId },
  });
  if (!client) throw new Error('CLIENT_NOT_FOUND');
  const capstoneClientId = ensureCapstoneClientId(client.capstoneClientId);
  let afId = client.accountFlowClientId || mockClientsByEngageId.get(client.id);
  if (!afId || !mockClients.has(afId)) {
    afId = `afc_mock_${randomUUID().slice(0, 12)}`;
    mockClients.set(afId, {
      id: afId,
      name: client.name,
      contactEmail: client.contactEmail,
      companyNumber: client.companyNumber,
      engageClientId: client.id,
      tenantId: params.tenantId,
      createdAt: new Date().toISOString(),
    });
    mockClientsByEngageId.set(client.id, afId);
  }
  await prisma.client.update({
    where: { id: client.id },
    data: {
      capstoneClientId,
      accountFlowClientId: afId,
      accountFlowLinkedAt: client.accountFlowLinkedAt || new Date(),
    },
  });
  return { capstoneClientId, accountFlowClientId: afId };
}

async function ensureWorkLinked(params: {
  tenantId: string;
  jobId: string;
  proposalId?: string | null;
  accountFlowClientId: string;
}): Promise<string> {
  const job = await prisma.job.findFirst({
    where: { id: params.jobId, tenantId: params.tenantId },
  });
  if (!job) throw new Error('JOB_NOT_FOUND');

  if (job.accountFlowWorkId && mockWork.has(job.accountFlowWorkId)) {
    return job.accountFlowWorkId;
  }
  if (job.accountFlowWorkId && job.accountFlowSyncStatus === 'LINKED') {
    return job.accountFlowWorkId;
  }

  const workId = job.accountFlowWorkId || `afw_mock_${randomUUID().slice(0, 12)}`;
  mockWork.set(workId, {
    id: workId,
    title: job.title,
    status: job.boardColumn,
    clientId: params.accountFlowClientId,
    engageJobId: job.id,
    engageProposalId: params.proposalId || job.proposalId,
    tenantId: params.tenantId,
    createdAt: new Date().toISOString(),
  });

  await prisma.job.update({
    where: { id: job.id },
    data: {
      accountFlowWorkId: workId,
      accountFlowSyncStatus: 'MOCK',
      accountFlowLastSyncedAt: new Date(),
    },
  });

  await prisma.jobActivity.create({
    data: {
      kind: 'ACCOUNTFLOW_LINKED',
      message: `Linked to AccountFlow work ${workId} (mesh mock — prod AF untouched)`,
      jobId: job.id,
      metadata: JSON.stringify({ accountFlowWorkId: workId, mode: 'mock' }),
    },
  });

  return workId;
}

function sandboxDeepLink(opts: {
  accountFlowClientId: string;
  accountFlowWorkId?: string | null;
}): string {
  // Stays inside Engage Practice UI — never redirects to production AF
  const q = new URLSearchParams({
    afClient: opts.accountFlowClientId,
  });
  if (opts.accountFlowWorkId) q.set('afWork', opts.accountFlowWorkId);
  return `/integrations/accountflow/sandbox?${q.toString()}`;
}

function apiKey(): string | null {
  return process.env.ACCOUNTFLOW_API_KEY?.trim() || null;
}

/** Whether Capstone Tandem HTTP (AF /api/v1/external/tandem) should be used. */
function shouldUseHttp(status: MeshStatus): boolean {
  if (status.mode === 'off' || status.mode === 'mock') return false;
  if (!status.accountFlowBaseUrl) return false;
  if (!apiKey()) return false;
  if (status.mode === 'live' && !allowLive()) return false;
  if (status.mode === 'local' && !isPrivateBase(status.accountFlowBaseUrl)) return false;
  return true;
}

async function tandemFetch<T>(
  path: string,
  init: RequestInit & { method?: string } = {}
): Promise<T> {
  const base = baseUrl();
  const key = apiKey();
  if (!base || !key) throw new Error('ACCOUNTFLOW_BASE_URL and ACCOUNTFLOW_API_KEY required');

  const url = `${base.replace(/\/$/, '')}/api/v1/external/tandem${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': key,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text };
  }
  if (!res.ok) {
    const msg = body?.error || body?.message || `AccountFlow tandem ${res.status}`;
    throw new Error(msg);
  }
  return (body?.data ?? body) as T;
}

async function linkClientHttp(params: { tenantId: string; clientId: string }): Promise<{
  capstoneClientId: string;
  accountFlowClientId: string;
  deepLink: string | null;
}> {
  const client = await prisma.client.findFirst({
    where: { id: params.clientId, tenantId: params.tenantId },
  });
  if (!client) throw new Error('CLIENT_NOT_FOUND');

  const engagePublic =
    process.env.ENGAGE_PUBLIC_URL?.replace(/\/$/, '') ||
    process.env.FRONTEND_URL?.replace(/\/$/, '') ||
    '';

  const data = await tandemFetch<{
    accountFlowClientId: string;
    capstoneClientId: string;
    deepLink?: string;
  }>('/clients/upsert', {
    method: 'POST',
    body: JSON.stringify({
      capstoneClientId: client.capstoneClientId || undefined,
      engageClientId: client.id,
      companyName: client.name,
      companyNumber: client.companyNumber || undefined,
      contactEmail: client.contactEmail || undefined,
      contactName: client.contactName || undefined,
      contactPhone: client.contactPhone || undefined,
      clientType: client.companyType || undefined,
      engageDeepLink: engagePublic
        ? `${engagePublic}/clients/${client.id}?from=accountflow`
        : undefined,
    }),
  });

  await prisma.client.update({
    where: { id: client.id },
    data: {
      capstoneClientId: data.capstoneClientId || client.capstoneClientId,
      accountFlowClientId: data.accountFlowClientId,
      accountFlowLinkedAt: client.accountFlowLinkedAt || new Date(),
    },
  });

  return {
    capstoneClientId: data.capstoneClientId,
    accountFlowClientId: data.accountFlowClientId,
    deepLink: data.deepLink || null,
  };
}

async function ensureWorkHttp(params: {
  tenantId: string;
  jobId: string;
  proposalId?: string | null;
  accountFlowClientId: string;
}): Promise<{ accountFlowWorkId: string; deepLink: string | null }> {
  const job = await prisma.job.findFirst({
    where: { id: params.jobId, tenantId: params.tenantId },
  });
  if (!job) throw new Error('JOB_NOT_FOUND');

  const due =
    job.dueAt instanceof Date
      ? job.dueAt.toISOString().slice(0, 10)
      : job.dueAt
        ? String(job.dueAt).slice(0, 10)
        : undefined;

  const data = await tandemFetch<{
    accountFlowWorkId: string;
    deepLink?: string;
  }>('/work/upsert', {
    method: 'POST',
    body: JSON.stringify({
      accountFlowClientId: params.accountFlowClientId,
      engageJobId: job.id,
      engageProposalId: params.proposalId || job.proposalId || undefined,
      title: job.title || job.reference || `Job ${job.id}`,
      status: job.boardColumn || 'OPEN',
      dueDate: due,
      metadata: { source: 'engage', boardColumn: job.boardColumn },
    }),
  });

  await prisma.job.update({
    where: { id: job.id },
    data: {
      accountFlowWorkId: data.accountFlowWorkId,
      accountFlowSyncStatus: 'LINKED',
      accountFlowLastSyncedAt: new Date(),
    },
  });

  await prisma.jobActivity.create({
    data: {
      kind: 'ACCOUNTFLOW_LINKED',
      message: `Linked to AccountFlow work ${data.accountFlowWorkId} via Capstone Tandem`,
      jobId: job.id,
      metadata: JSON.stringify({
        accountFlowWorkId: data.accountFlowWorkId,
        mode: resolveMode(),
        transport: 'http',
      }),
    },
  });

  return {
    accountFlowWorkId: data.accountFlowWorkId,
    deepLink: data.deepLink || null,
  };
}

/**
 * Primary handoff: ensure AF client (+ optional work) exist in mesh and return deep link.
 * - mock: in-process sandbox (default, prod AF never contacted)
 * - local/live: Capstone Tandem HTTP → AccountFlow /api/v1/external/tandem/*
 */
export async function handoffToAccountFlow(params: {
  tenantId: string;
  proposalId?: string | null;
  jobId?: string | null;
  clientId?: string | null;
  mode?: 'open' | 'create_and_open';
}): Promise<HandoffResult> {
  const status = getMeshStatus();
  if (status.mode === 'off' || !status.available) {
    return {
      available: false,
      mode: status.mode,
      status: 'disabled',
      message: status.message,
      deepLink: null,
      accountFlowClientId: null,
      accountFlowWorkId: null,
      capstoneClientId: null,
      jobId: params.jobId,
      proposalId: params.proposalId,
    };
  }

  let clientId = params.clientId || null;
  let jobId = params.jobId || null;
  let proposalId = params.proposalId || null;

  if (jobId) {
    const job = await prisma.job.findFirst({
      where: { id: jobId, tenantId: params.tenantId },
      select: { clientId: true, proposalId: true, id: true },
    });
    if (!job) {
      return {
        available: false,
        mode: status.mode,
        status: 'error',
        message: 'Job not found',
        deepLink: null,
        accountFlowClientId: null,
        accountFlowWorkId: null,
        capstoneClientId: null,
      };
    }
    clientId = job.clientId;
    proposalId = proposalId || job.proposalId;
  } else if (proposalId) {
    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, tenantId: params.tenantId },
      select: { clientId: true, id: true },
    });
    if (!proposal) {
      return {
        available: false,
        mode: status.mode,
        status: 'error',
        message: 'Proposal not found',
        deepLink: null,
        accountFlowClientId: null,
        accountFlowWorkId: null,
        capstoneClientId: null,
      };
    }
    clientId = proposal.clientId;
    if (!jobId) {
      const j = await prisma.job.findFirst({
        where: { proposalId, tenantId: params.tenantId },
        select: { id: true },
      });
      jobId = j?.id || null;
    }
  }

  if (!clientId) {
    return {
      available: false,
      mode: status.mode,
      status: 'error',
      message: 'clientId, jobId, or proposalId required',
      deepLink: null,
      accountFlowClientId: null,
      accountFlowWorkId: null,
      capstoneClientId: null,
    };
  }

  const useHttp = shouldUseHttp(status);

  try {
    if (useHttp) {
      const linked = await linkClientHttp({ tenantId: params.tenantId, clientId });
      let workId: string | null = null;
      let workDeep: string | null = null;
      if (jobId) {
        const work = await ensureWorkHttp({
          tenantId: params.tenantId,
          jobId,
          proposalId,
          accountFlowClientId: linked.accountFlowClientId,
        });
        workId = work.accountFlowWorkId;
        workDeep = work.deepLink;
      }
      return {
        available: true,
        mode: status.mode,
        status: 'linked',
        message: `Linked via Capstone Tandem (${status.mode}) → AccountFlow.`,
        deepLink: workDeep || linked.deepLink,
        accountFlowClientId: linked.accountFlowClientId,
        accountFlowWorkId: workId,
        capstoneClientId: linked.capstoneClientId,
        jobId,
        proposalId,
      };
    }

    // Default mock path — production AF never contacted
    const linked = await linkClientMock({ tenantId: params.tenantId, clientId });

    let workId: string | null = null;
    if (jobId) {
      workId = await ensureWorkLinked({
        tenantId: params.tenantId,
        jobId,
        proposalId,
        accountFlowClientId: linked.accountFlowClientId,
      });
    }

    const deepLink = sandboxDeepLink({
      accountFlowClientId: linked.accountFlowClientId,
      accountFlowWorkId: workId,
    });

    return {
      available: true,
      mode: 'mock',
      status: 'mock_linked',
      message: 'Linked in AccountFlow mesh sandbox (production AccountFlow not contacted).',
      deepLink,
      accountFlowClientId: linked.accountFlowClientId,
      accountFlowWorkId: workId,
      capstoneClientId: linked.capstoneClientId,
      jobId,
      proposalId,
    };
  } catch (e: any) {
    logger.warn('accountFlowMesh handoff failed', { err: e?.message, useHttp });
    return {
      available: false,
      mode: status.mode,
      status: 'error',
      message: e?.message || 'Handoff failed',
      deepLink: null,
      accountFlowClientId: null,
      accountFlowWorkId: null,
      capstoneClientId: null,
      jobId,
      proposalId,
    };
  }
}

/**
 * Link all open jobs for a tenant into the mock AF mesh (practice sandbox).
 * Production AccountFlow is never contacted in mock mode.
 */
export async function handoffAllOpenJobs(tenantId: string): Promise<{
  mode: MeshMode;
  linked: number;
  skipped: number;
  results: HandoffResult[];
}> {
  const status = getMeshStatus();
  if (status.mode === 'off' || !status.available) {
    return { mode: status.mode, linked: 0, skipped: 0, results: [] };
  }

  const jobs = await prisma.job.findMany({
    where: { tenantId, isActive: true, boardColumn: { not: 'COMPLETE' } },
    select: { id: true },
    take: 100,
  });

  const results: HandoffResult[] = [];
  let linked = 0;
  let skipped = 0;
  for (const j of jobs) {
    const r = await handoffToAccountFlow({
      tenantId,
      jobId: j.id,
      mode: 'create_and_open',
    });
    results.push(r);
    if (r.available && r.accountFlowWorkId) linked += 1;
    else skipped += 1;
  }

  return { mode: status.mode, linked, skipped, results };
}

/** Called after job spawn — best-effort mesh link, never throws to caller. */
export async function onJobSpawnedMesh(params: {
  tenantId: string;
  jobId: string;
  clientId: string;
  proposalId?: string | null;
}): Promise<void> {
  try {
    const status = getMeshStatus();
    if (status.mode === 'off') return;
    await handoffToAccountFlow({
      tenantId: params.tenantId,
      jobId: params.jobId,
      clientId: params.clientId,
      proposalId: params.proposalId,
      mode: 'create_and_open',
    });
  } catch (e) {
    logger.warn('accountFlowMesh onJobSpawnedMesh ignored error', e);
  }
}

export function listMockAccountFlowState(tenantId: string) {
  const clients = [...mockClients.values()].filter((c) => c.tenantId === tenantId);
  const work = [...mockWork.values()].filter((w) => w.tenantId === tenantId);
  return { clients, work, mode: resolveMode() };
}

export function getMockWork(id: string) {
  return mockWork.get(id) || null;
}

export function getMockClient(id: string) {
  return mockClients.get(id) || null;
}
