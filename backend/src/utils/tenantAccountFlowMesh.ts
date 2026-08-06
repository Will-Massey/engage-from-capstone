/**
 * Per-tenant Capstone Tandem (AccountFlow mesh) settings.
 * Stored under Tenant.settings JSON key `accountFlowMesh`.
 * Env vars remain global fallbacks (and safety rails for live mode).
 */

export type MeshMode = 'mock' | 'local' | 'live' | 'off';

export interface AccountFlowMeshSettings {
  mode: MeshMode;
  baseUrl: string | null;
  /** Practice-scoped AF API key (af_live_…). Never return in full to non-admin UI. */
  apiKey: string | null;
  /** Tenant opted into live HTTP. */
  allowLive: boolean;
  /** Auto-link clients/work on proposal accept / job spawn. */
  autoHandoff: boolean;
  /** Request SSO handoff codes so AF deep links skip re-login. */
  ssoEnabled: boolean;
  lastPingAt?: string | null;
  lastPingOk?: boolean | null;
  lastPingMessage?: string | null;
}

const DEFAULTS: AccountFlowMeshSettings = {
  mode: 'mock',
  baseUrl: null,
  apiKey: null,
  allowLive: false,
  autoHandoff: true,
  ssoEnabled: true,
  lastPingAt: null,
  lastPingOk: null,
  lastPingMessage: null,
};

export function parseTenantSettingsJson(raw: string | null | undefined): Record<string, unknown> {
  try {
    const o = JSON.parse(raw || '{}');
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getAccountFlowMeshSettings(
  tenantSettingsJson?: string | null
): AccountFlowMeshSettings {
  const root = parseTenantSettingsJson(tenantSettingsJson);
  const raw = (root.accountFlowMesh || {}) as Partial<AccountFlowMeshSettings>;

  let mode: MeshMode = DEFAULTS.mode;
  const m = String(raw.mode || process.env.ACCOUNTFLOW_MESH_MODE || 'mock')
    .toLowerCase()
    .trim();
  if (m === 'off' || m === 'false' || m === '0') mode = 'off';
  else if (m === 'local') mode = 'local';
  else if (m === 'live') mode = 'live';
  else mode = 'mock';

  const envUrl = process.env.ACCOUNTFLOW_BASE_URL?.trim() || null;
  const envKey = process.env.ACCOUNTFLOW_API_KEY?.trim() || null;

  return {
    mode,
    baseUrl: (raw.baseUrl && String(raw.baseUrl).trim()) || envUrl,
    apiKey: (raw.apiKey && String(raw.apiKey).trim()) || envKey,
    allowLive: raw.allowLive === true || process.env.ACCOUNTFLOW_MESH_ALLOW_LIVE === 'true',
    autoHandoff: raw.autoHandoff !== false,
    ssoEnabled: raw.ssoEnabled !== false,
    lastPingAt: raw.lastPingAt ?? null,
    lastPingOk: raw.lastPingOk ?? null,
    lastPingMessage: raw.lastPingMessage ?? null,
  };
}

/** Safe view for API responses — mask API key. */
export function publicMeshSettings(s: AccountFlowMeshSettings) {
  const key = s.apiKey;
  return {
    mode: s.mode,
    baseUrl: s.baseUrl,
    hasApiKey: !!key,
    apiKeyPreview: key ? `${key.slice(0, 10)}…${key.slice(-4)}` : null,
    allowLive: s.allowLive,
    autoHandoff: s.autoHandoff,
    ssoEnabled: s.ssoEnabled,
    lastPingAt: s.lastPingAt ?? null,
    lastPingOk: s.lastPingOk ?? null,
    lastPingMessage: s.lastPingMessage ?? null,
    envFallback: {
      mode: process.env.ACCOUNTFLOW_MESH_MODE || 'mock',
      hasBaseUrl: !!process.env.ACCOUNTFLOW_BASE_URL,
      hasApiKey: !!process.env.ACCOUNTFLOW_API_KEY,
      allowLive: process.env.ACCOUNTFLOW_MESH_ALLOW_LIVE === 'true',
    },
  };
}

export function mergeAccountFlowMeshSettings(
  tenantSettingsJson: string | null | undefined,
  patch: Partial<AccountFlowMeshSettings> & { apiKey?: string | null; clearApiKey?: boolean }
): string {
  const root = parseTenantSettingsJson(tenantSettingsJson);
  const prev = getAccountFlowMeshSettings(tenantSettingsJson);
  const next: AccountFlowMeshSettings = {
    ...prev,
    mode: (patch.mode as MeshMode) || prev.mode,
    baseUrl:
      patch.baseUrl !== undefined
        ? patch.baseUrl
          ? String(patch.baseUrl).trim()
          : null
        : prev.baseUrl,
    allowLive: patch.allowLive !== undefined ? !!patch.allowLive : prev.allowLive,
    autoHandoff: patch.autoHandoff !== undefined ? !!patch.autoHandoff : prev.autoHandoff,
    ssoEnabled: patch.ssoEnabled !== undefined ? !!patch.ssoEnabled : prev.ssoEnabled,
    lastPingAt: patch.lastPingAt !== undefined ? patch.lastPingAt : prev.lastPingAt,
    lastPingOk: patch.lastPingOk !== undefined ? patch.lastPingOk : prev.lastPingOk,
    lastPingMessage:
      patch.lastPingMessage !== undefined ? patch.lastPingMessage : prev.lastPingMessage,
    apiKey: prev.apiKey,
  };

  if (patch.clearApiKey) next.apiKey = null;
  else if (patch.apiKey !== undefined && patch.apiKey !== null && String(patch.apiKey).trim()) {
    next.apiKey = String(patch.apiKey).trim();
  }

  root.accountFlowMesh = next;
  return JSON.stringify(root);
}
