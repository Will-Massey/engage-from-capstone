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

// --- env compatibility helpers used by HTTP path until fully tenant-scoped ---
function resolveMode(): MeshMode {
  return getAccountFlowMeshSettings(null).mode;
}
function allowLive(): boolean {
  return getAccountFlowMeshSettings(null).allowLive || envAllowsLive();
}
function baseUrl(): string | null {
  return getAccountFlowMeshSettings(null).baseUrl;
}
function apiKeyFromEnv(): string | null {
  return getAccountFlowMeshSettings(null).apiKey;
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

/** Whether Capstone Tandem HTTP (AF /api/v1/external/tandem) should be used. */
function shouldUseHttp(status: MeshStatus, apiKey?: string | null): boolean {
  if (status.mode === 'off' || status.mode === 'mock') return false;
  if (!status.accountFlowBaseUrl) return false;
  if (!(apiKey || apiKeyFromEnv())) return false;
  if (status.mode === 'local' && !isPrivateBase(status.accountFlowBaseUrl)) return false;
  return true;
}

async function tandemFetch<T>(
  path: string,
  init: RequestInit & { method?: string } = {},
  rt?: MeshRuntime | null
): Promise<T> {
  const base = rt?.baseUrl || baseUrl();
  const key = rt?.apiKey || apiKeyFromEnv();
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

async function linkClientHttp(
  params: { tenantId: string; clientId: string },
  rt?: MeshRuntime | null
): Promise<{
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
  }>(
    '/clients/upsert',
    {
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
    },
    rt
  );

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

async function ensureWorkHttp(
  params: {
    tenantId: string;
    jobId: string;
    proposalId?: string | null;
    accountFlowClientId: string;
  },
  rt?: MeshRuntime | null
): Promise<{ accountFlowWorkId: string; deepLink: string | null }> {
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
  }>(
    '/work/upsert',
    {
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
    },
    rt
  );

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

/** Exchange an AF deep link for an SSO handoff URL (skip re-login). */
async function wrapDeepLinkWithSso(
  rt: MeshRuntime,
  afDeepLink: string | null,
  ssoUser: { email?: string | null; fullName?: string | null; role?: string | null }
): Promise<string | null> {
  if (!afDeepLink || !ssoUser.email) return afDeepLink;
  try {
    let redirectPath = afDeepLink;
    try {
      const u = new URL(afDeepLink);
      redirectPath = u.pathname + u.search;
    } catch {
      if (!redirectPath.startsWith('/')) redirectPath = `/${redirectPath}`;
    }
    const sso = await tandemFetch<{ deepLink: string }>(
      '/session/handoff',
      {
        method: 'POST',
        body: JSON.stringify({
          email: ssoUser.email,
          fullName: ssoUser.fullName || undefined,
          role: ssoUser.role || undefined,
          redirectPath,
        }),
      },
      rt
    );
    return sso.deepLink || afDeepLink;
  } catch (e: any) {
    logger.warn('accountFlowMesh SSO handoff skipped', { err: e?.message });
    return afDeepLink;
  }
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
  /** For SSO handoff into AF without re-login */
  ssoUser?: { email?: string | null; fullName?: string | null; role?: string | null } | null;
}): Promise<HandoffResult> {
  const rt = await loadRuntime(params.tenantId);
  const status = statusFromRuntime(rt);
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

  const useHttp = shouldUseHttp(status, rt.apiKey);

  try {
    if (useHttp) {
      const linked = await linkClientHttp({ tenantId: params.tenantId, clientId }, rt);
      let workId: string | null = null;
      let workDeep: string | null = null;
      if (jobId) {
        const work = await ensureWorkHttp(
          {
            tenantId: params.tenantId,
            jobId,
            proposalId,
            accountFlowClientId: linked.accountFlowClientId,
          },
          rt
        );
        workId = work.accountFlowWorkId;
        workDeep = work.deepLink;
      }
      let deepLink = workDeep || linked.deepLink;
      if (rt.ssoEnabled && params.ssoUser?.email) {
        deepLink = await wrapDeepLinkWithSso(rt, deepLink, params.ssoUser);
      }
      return {
        available: true,
        mode: status.mode,
        status: 'linked',
        message: `Linked via Capstone Tandem (${status.mode}) → AccountFlow.`,
        deepLink,
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
export async function handoffAllOpenJobs(
  tenantId: string,
  ssoUser?: { email?: string | null; fullName?: string | null; role?: string | null } | null
): Promise<{
  mode: MeshMode;
  linked: number;
  skipped: number;
  results: HandoffResult[];
}> {
  const status = await getMeshStatusForTenant(tenantId);
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
      ssoUser,
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
    const rt = await loadRuntime(params.tenantId);
    const status = statusFromRuntime(rt);
    if (status.mode === 'off') return;
    if (!rt.autoHandoff) {
      logger.info('accountFlowMesh autoHandoff disabled for tenant — skip spawn link');
      return;
    }
    await handoffToAccountFlow({
      tenantId: params.tenantId,
      jobId: params.jobId,
      clientId: params.clientId,
      proposalId: params.proposalId,
      mode: 'create_and_open',
    });
    void publishTandemEvent({
      type: 'job.created',
      tenantId: params.tenantId,
      jobId: params.jobId,
      clientId: params.clientId,
      proposalId: params.proposalId,
    });
  } catch (e) {
    logger.warn('accountFlowMesh onJobSpawnedMesh ignored error', e);
  }
}

/**
 * Fire-and-forget event to AccountFlow Capstone Tandem bus.
 * No-op in mock/off modes. Never throws.
 */
export async function publishTandemEvent(params: {
  type: string;
  tenantId: string;
  jobId?: string | null;
  clientId?: string | null;
  proposalId?: string | null;
  boardColumn?: string | null;
  extra?: Record<string, unknown>;
}): Promise<void> {
  try {
    const rt = await loadRuntime(params.tenantId);
    const status = statusFromRuntime(rt);
    if (!shouldUseHttp(status, rt.apiKey)) return;

    let clientId = params.clientId || null;
    let companyName: string | undefined;
    let companyNumber: string | undefined;
    let contactEmail: string | undefined;
    let contactName: string | undefined;
    let contactPhone: string | undefined;
    let clientType: string | undefined;
    let capstoneClientId: string | undefined;
    let jobTitle: string | undefined;
    let dueAt: string | undefined;

    if (params.jobId) {
      const job = await prisma.job.findFirst({
        where: { id: params.jobId, tenantId: params.tenantId },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              companyNumber: true,
              contactEmail: true,
              contactName: true,
              contactPhone: true,
              companyType: true,
              capstoneClientId: true,
            },
          },
        },
      });
      if (job) {
        clientId = job.clientId;
        jobTitle = job.title;
        dueAt = job.dueAt ? job.dueAt.toISOString() : undefined;
        companyName = job.client.name;
        companyNumber = job.client.companyNumber || undefined;
        contactEmail = job.client.contactEmail || undefined;
        contactName = job.client.contactName || undefined;
        contactPhone = job.client.contactPhone || undefined;
        clientType = job.client.companyType || undefined;
        capstoneClientId = job.client.capstoneClientId || undefined;
      }
    } else if (clientId) {
      const c = await prisma.client.findFirst({
        where: { id: clientId, tenantId: params.tenantId },
      });
      if (c) {
        companyName = c.name;
        companyNumber = c.companyNumber || undefined;
        contactEmail = c.contactEmail || undefined;
        contactName = c.contactName || undefined;
        contactPhone = c.contactPhone || undefined;
        clientType = c.companyType || undefined;
        capstoneClientId = c.capstoneClientId || undefined;
      }
    }

    if (!clientId || !companyName) return;

    const engagePublic =
      process.env.ENGAGE_PUBLIC_URL?.replace(/\/$/, '') ||
      process.env.FRONTEND_URL?.replace(/\/$/, '') ||
      '';

    await tandemFetch(
      '/events',
      {
        method: 'POST',
        body: JSON.stringify({
          type: params.type,
          payload: {
            engageClientId: clientId,
            clientId,
            capstoneClientId,
            companyName,
            companyNumber,
            contactEmail,
            contactName,
            contactPhone,
            clientType,
            engageJobId: params.jobId || undefined,
            jobId: params.jobId || undefined,
            engageProposalId: params.proposalId || undefined,
            proposalId: params.proposalId || undefined,
            jobTitle,
            title: jobTitle,
            boardColumn: params.boardColumn || undefined,
            status: params.boardColumn || undefined,
            dueAt,
            engageDeepLink: engagePublic
              ? `${engagePublic}/clients/${clientId}?from=accountflow`
              : undefined,
            ...(params.extra || {}),
          },
        }),
      },
      rt
    );
  } catch (e: any) {
    logger.warn('accountFlowMesh publishTandemEvent failed', {
      type: params.type,
      err: e?.message,
    });
  }
}

/**
 * Inbound status mirror from AccountFlow (Capstone Tandem reverse path).
 */
export async function applyInboundFromAccountFlow(params: {
  type: string;
  engageJobId?: string | null;
  boardColumn?: string | null;
  status?: string | null;
  message?: string | null;
}): Promise<{ updated: boolean; jobId?: string; boardColumn?: string }> {
  const jobId = params.engageJobId;
  if (!jobId) return { updated: false };

  const job = await prisma.job.findFirst({ where: { id: jobId } });
  if (!job) return { updated: false };

  const mapped = mapAfStatusToBoardColumn(params.boardColumn || params.status);
  if (!mapped || mapped === job.boardColumn) {
    if (params.message) {
      await prisma.jobActivity.create({
        data: {
          kind: 'ACCOUNTFLOW_NOTE',
          message: params.message.slice(0, 500),
          jobId: job.id,
          metadata: JSON.stringify({ source: 'accountflow', type: params.type }),
        },
      });
    }
    return { updated: false, jobId: job.id, boardColumn: job.boardColumn };
  }

  await prisma.job.update({
    where: { id: job.id },
    data: {
      boardColumn: mapped as any,
      completedAt: mapped === 'COMPLETE' ? new Date() : null,
      accountFlowSyncStatus: 'SYNCED_FROM_AF',
      accountFlowLastSyncedAt: new Date(),
    },
  });

  await prisma.jobActivity.create({
    data: {
      kind: 'ACCOUNTFLOW_SYNC',
      message:
        params.message || `AccountFlow updated board → ${mapped.replace(/_/g, ' ').toLowerCase()}`,
      jobId: job.id,
      metadata: JSON.stringify({
        source: 'accountflow',
        type: params.type,
        from: job.boardColumn,
        to: mapped,
      }),
    },
  });

  return { updated: true, jobId: job.id, boardColumn: mapped };
}

function mapAfStatusToBoardColumn(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase().replace(/\s+/g, '_');
  if (s === 'COMPLETE' || s === 'COMPLETED' || s === 'DONE') return 'COMPLETE';
  if (s === 'BLOCKED' || s === 'HELP_NEEDED' || s === 'HELP') return 'HELP_NEEDED';
  if (s === 'IN_REVIEW' || s === 'REVIEW') return 'IN_REVIEW';
  if (s === 'IN_PROGRESS' || s === 'ACTIVE' || s === 'OPEN' || s === 'DOING') return 'IN_PROGRESS';
  if (s === 'REQUEST_RECORDS' || s === 'RECORDS_RECEIVED') return s;
  if (
    [
      'REQUEST_RECORDS',
      'RECORDS_RECEIVED',
      'IN_PROGRESS',
      'HELP_NEEDED',
      'IN_REVIEW',
      'COMPLETE',
    ].includes(s)
  ) {
    return s;
  }
  return null;
}

/** Ping AF tandem (env-level; tenant-aware version is testMeshConnection). */
export async function pingAccountFlowTandem(): Promise<{
  ok: boolean;
  message: string;
  practiceName?: string;
}> {
  const status = getMeshStatus();
  if (!shouldUseHttp(status, apiKeyFromEnv())) {
    return { ok: status.mode === 'mock', message: status.message };
  }
  try {
    const data = await tandemFetch<{ practiceName?: string }>('/ping', { method: 'GET' });
    return {
      ok: true,
      message: `Capstone Tandem OK${data?.practiceName ? ` · ${data.practiceName}` : ''}`,
      practiceName: data?.practiceName,
    };
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Tandem ping failed' };
  }
}

/** Ping AF tandem + optionally persist lastPing on tenant settings. */
export async function testMeshConnection(tenantId: string): Promise<{
  ok: boolean;
  message: string;
  status: MeshStatus;
  ping?: unknown;
}> {
  const rt = await loadRuntime(tenantId);
  const status = statusFromRuntime(rt);
  if (!shouldUseHttp(status, rt.apiKey)) {
    return {
      ok: status.mode === 'mock',
      message: status.message,
      status,
    };
  }
  try {
    const ping = await tandemFetch('/ping', { method: 'GET' }, rt);
    // persist last ping
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const { mergeAccountFlowMeshSettings } = await import('../utils/tenantAccountFlowMesh.js');
    const next = mergeAccountFlowMeshSettings(tenant?.settings, {
      lastPingAt: new Date().toISOString(),
      lastPingOk: true,
      lastPingMessage: 'Ping OK',
    });
    await prisma.tenant.update({ where: { id: tenantId }, data: { settings: next } });
    return { ok: true, message: 'Connected to AccountFlow Tandem.', status, ping };
  } catch (e: any) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const { mergeAccountFlowMeshSettings } = await import('../utils/tenantAccountFlowMesh.js');
    const next = mergeAccountFlowMeshSettings(tenant?.settings, {
      lastPingAt: new Date().toISOString(),
      lastPingOk: false,
      lastPingMessage: e?.message || 'Ping failed',
    });
    await prisma.tenant.update({ where: { id: tenantId }, data: { settings: next } });
    return {
      ok: false,
      message: e?.message || 'Ping failed',
      status,
    };
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
