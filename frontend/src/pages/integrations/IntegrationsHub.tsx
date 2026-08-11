import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowsRightLeftIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { StatusChip } from '../../components/ui/StatusChip';
import MailboxConnect from '../../components/email/MailboxConnect';
import WebhookSettings from '../../components/settings/WebhookSettings';
import XeroConnect from '../../components/integrations/XeroConnect';
import QuickBooksConnect from '../../components/integrations/QuickBooksConnect';

type MeshSettings = {
  mode: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  allowLive: boolean;
  autoHandoff: boolean;
  ssoEnabled: boolean;
  lastPingAt?: string | null;
  lastPingOk?: boolean | null;
  lastPingMessage?: string | null;
};

type HubData = {
  accountFlow: {
    mode: string;
    available: boolean;
    message: string;
    sandboxClients?: number;
    sandboxWork?: number;
    isolation?: string;
    autoHandoff?: boolean;
    ssoEnabled?: boolean;
    hasApiKey?: boolean;
    settings?: MeshSettings;
  };
  xero: {
    connected: boolean;
    configured?: boolean;
    oauthConfigured?: boolean;
    xeroTenantName?: string;
    docs?: string;
  };
  quickbooks: {
    connected: boolean;
    configured?: boolean;
    oauthConfigured?: boolean;
    companyName?: string;
    docs?: string;
  };
};

export default function IntegrationsHub() {
  const [hub, setHub] = useState<HubData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Connection form
  const [mode, setMode] = useState('mock');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [allowLive, setAllowLive] = useState(false);
  const [autoHandoff, setAutoHandoff] = useState(true);
  const [ssoEnabled, setSsoEnabled] = useState(true);

  const load = async () => {
    try {
      const res = (await apiClient.get('/integrations/hub')) as any;
      const data = res?.data ?? res;
      setHub(data);
      setError(null);
      const s = data?.accountFlow?.settings as MeshSettings | undefined;
      if (s) {
        setMode(s.mode || 'mock');
        setBaseUrl(s.baseUrl || '');
        setAllowLive(!!s.allowLive);
        setAutoHandoff(s.autoHandoff !== false);
        setSsoEnabled(s.ssoEnabled !== false);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load integrations hub');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function batchMesh() {
    setBusy(true);
    setBatchMsg(null);
    try {
      const res = (await apiClient.post('/integrations/accountflow/handoff-open-jobs', {})) as any;
      setBatchMsg(res?.message || res?.data?.message || 'Batch complete');
      await load();
    } catch (e: any) {
      setBatchMsg(e?.response?.data?.error?.message || e.message || 'Batch failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveConnection() {
    setBusy(true);
    setSaveMsg(null);
    try {
      const body: Record<string, unknown> = {
        mode,
        baseUrl: baseUrl.trim() || null,
        allowLive,
        autoHandoff,
        ssoEnabled,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      const res = (await apiClient.put('/integrations/accountflow/connection', body)) as any;
      setSaveMsg(res?.data?.message || 'Saved.');
      setApiKey('');
      await load();
    } catch (e: any) {
      setSaveMsg(e?.response?.data?.error?.message || e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setBusy(true);
    setSaveMsg(null);
    try {
      const res = (await apiClient.post('/integrations/accountflow/connection/test', {})) as any;
      const d = res?.data ?? res;
      setSaveMsg(d?.message || (d?.ok ? 'Ping OK' : 'Ping failed'));
      await load();
    } catch (e: any) {
      setSaveMsg(e?.response?.data?.data?.message || e?.message || 'Test failed');
    } finally {
      setBusy(false);
    }
  }

  const settings = hub?.accountFlow?.settings;
  const httpReady = hub?.accountFlow?.mode === 'local' || hub?.accountFlow?.mode === 'live';

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <header className="metal-tile p-6">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1]">
          <p className="metal-kicker">Integrations</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
            Practice integrations desk
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Connect Engage to the rest of your practice: your Microsoft 365 or Google mailbox,
            AccountFlow (Capstone Tandem) for auto-handoff and SSO, Xero and QuickBooks Online for
            client sync, and outbound webhooks for Zapier, Make, or your practice management tool.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Connect your mailbox — the most-wanted connection */}
      <section className="metal-tile p-6 space-y-4">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Email</h2>
            <p className="mt-1 text-sm text-slate-500">
              Connect your Microsoft 365 or Google mailbox so Engage can send and receive client
              email in one place, with two-way sync and AI-drafted replies ready for your review.
            </p>
          </div>
          <MailboxConnect />
        </div>
      </section>

      {/* Connect AccountFlow */}
      <section className="metal-tile p-6 space-y-4">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Connect AccountFlow
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Paste a practice API key from AccountFlow (Admin → External API / keys with{' '}
                <code className="text-xs">clients:write</code>). Enable auto-handoff so accepted
                proposals create AF clients automatically. SSO skips re-login when opening AF.
              </p>
            </div>
            {hub && (
              <StatusChip tone={httpReady ? 'success' : 'neutral'}>
                {hub.accountFlow.mode}
              </StatusChip>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-300">Mode</span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="mock">mock (sandbox only)</option>
                <option value="local">local (localhost AF)</option>
                <option value="live">live (production AF)</option>
                <option value="off">off</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 dark:text-slate-300">AccountFlow base URL</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                placeholder="https://app.capstonesoftware.co.uk"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600 dark:text-slate-300">
                API key {settings?.hasApiKey ? `(stored: ${settings.apiKeyPreview})` : ''}
              </span>
              <input
                type="password"
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                placeholder={settings?.hasApiKey ? 'Leave blank to keep existing key' : 'af_live_…'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowLive}
                onChange={(e) => setAllowLive(e.target.checked)}
              />
              Allow live outbound calls
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoHandoff}
                onChange={(e) => setAutoHandoff(e.target.checked)}
              />
              Auto-handoff on proposal accept
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={ssoEnabled}
                onChange={(e) => setSsoEnabled(e.target.checked)}
              />
              SSO (no re-login on Open in AccountFlow)
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-accent text-sm"
              disabled={busy}
              onClick={() => void saveConnection()}
            >
              {busy ? 'Saving…' : 'Save connection'}
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={busy}
              onClick={() => void testConnection()}
            >
              Test connection
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={busy}
              onClick={() => void batchMesh()}
            >
              Link all open jobs
            </button>
            <Link to="/integrations/accountflow/sandbox" className="btn-secondary text-sm">
              Open sandbox
            </Link>
          </div>

          {saveMsg && <p className="text-sm text-slate-700 dark:text-slate-200">{saveMsg}</p>}
          {batchMsg && <p className="text-sm text-emerald-800">{batchMsg}</p>}
          {settings?.lastPingAt && (
            <p className="text-xs text-slate-500">
              Last ping: {new Date(settings.lastPingAt).toLocaleString()} —{' '}
              {settings.lastPingOk ? 'OK' : 'failed'}
              {settings.lastPingMessage ? ` (${settings.lastPingMessage})` : ''}
            </p>
          )}
          {hub?.accountFlow?.message && (
            <p className="text-xs text-slate-500">{hub.accountFlow.message}</p>
          )}
        </div>
      </section>

      {/* Accounting ledgers — the real connect/disconnect/import flow lives here,
          not behind a link. These widgets own their own status and OAuth params. */}
      <section className="metal-tile p-6 space-y-4" data-testid="xero-integration">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Xero</h2>
            <p className="mt-1 text-sm text-slate-500">
              Connect your Xero organisation to import clients and sync accepted proposals.
            </p>
          </div>
          <XeroConnect />
        </div>
      </section>

      <section className="metal-tile p-6 space-y-4" data-testid="quickbooks-integration">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              QuickBooks Online
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Connect QuickBooks Online to import customers and mirror collected payments as
              invoices.
            </p>
          </div>
          <QuickBooksConnect />
        </div>
      </section>

      {/* Automation webhooks */}
      <section className="metal-tile p-6 space-y-4">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Automation webhooks
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Send proposal events to Zapier, Make, HubSpot, Senta, or Karbon as proposals move
              through your pipeline.
            </p>
          </div>
          <WebhookSettings />
        </div>
      </section>

      <div className="metal-tile metal-tile--soft flex items-start gap-3 p-4">
        <ShieldCheckIcon className="h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong>How it works:</strong> On proposal accept, Engage spawns a delivery job and (when
          auto-handoff is on) upserts the client + work shell into AccountFlow via Capstone Tandem.
          Matching AF users (same email) can open AF deep links without signing in again when SSO is
          enabled. API keys never leave your practice settings JSON.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <ArrowsRightLeftIcon className="h-4 w-4" />
        Capstone Tandem · Engage ↔ AccountFlow
      </div>
    </div>
  );
}
