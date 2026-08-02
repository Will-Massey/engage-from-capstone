import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowsRightLeftIcon,
  BuildingLibraryIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { StatusChip } from '../../components/ui/StatusChip';

type HubData = {
  accountFlow: {
    mode: string;
    available: boolean;
    message: string;
    sandboxClients?: number;
    sandboxWork?: number;
    isolation?: string;
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

function ConnBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
      <CheckCircleIcon className="h-4 w-4" /> Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-slate-400">
      <XCircleIcon className="h-4 w-4" /> Not connected
    </span>
  );
}

export default function IntegrationsHub() {
  const [hub, setHub] = useState<HubData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = (await apiClient.get('/integrations/hub')) as any;
      setHub(res?.data ?? res);
      setError(null);
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
            Xero, QuickBooks Online, and AccountFlow mesh status. AF mesh stays{' '}
            <strong>mock</strong> unless live is explicitly allowed — production AF is never
            contacted from practice by default.
          </p>
        </div>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <article className="metal-tile metal-tile--mint p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1] space-y-2">
            <ArrowsRightLeftIcon className="h-7 w-7 text-emerald-600" />
            <h2 className="font-semibold text-slate-900 dark:text-white">AccountFlow mesh</h2>
            {hub ? (
              <>
                <StatusChip tone={hub.accountFlow.available ? 'success' : 'neutral'}>
                  {hub.accountFlow.mode}
                </StatusChip>
                <p className="text-xs text-slate-500">{hub.accountFlow.message}</p>
                <p className="text-xs text-slate-500">
                  Sandbox: {hub.accountFlow.sandboxClients ?? 0} clients ·{' '}
                  {hub.accountFlow.sandboxWork ?? 0} work items
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Link to="/integrations/accountflow/sandbox" className="btn-secondary text-xs">
                    Open sandbox
                  </Link>
                  <button
                    type="button"
                    className="btn-accent text-xs"
                    disabled={busy}
                    onClick={() => void batchMesh()}
                  >
                    {busy ? 'Linking…' : 'Link all open jobs'}
                  </button>
                </div>
                {batchMsg && <p className="text-xs text-emerald-800">{batchMsg}</p>}
              </>
            ) : (
              <p className="text-sm text-slate-400">Loading…</p>
            )}
          </div>
        </article>

        <article className="metal-tile metal-tile--sky p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1] space-y-2">
            <BuildingLibraryIcon className="h-7 w-7 text-sky-600" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Xero</h2>
            {hub ? (
              <>
                <ConnBadge ok={!!hub.xero.connected} />
                <p className="text-xs text-slate-500">
                  OAuth app:{' '}
                  {hub.xero.oauthConfigured || hub.xero.configured ? 'configured' : 'not set'}
                  {hub.xero.xeroTenantName ? ` · ${hub.xero.xeroTenantName}` : ''}
                </p>
                <p className="text-2xs text-slate-400">
                  Connect in Settings. Push accepted proposals / import contacts when live.
                </p>
                <Link to="/settings" className="btn-secondary mt-2 inline-flex text-xs">
                  Settings
                </Link>
              </>
            ) : (
              <p className="text-sm text-slate-400">Loading…</p>
            )}
          </div>
        </article>

        <article className="metal-tile metal-tile--violet p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1] space-y-2">
            <BuildingLibraryIcon className="h-7 w-7 text-violet-600" />
            <h2 className="font-semibold text-slate-900 dark:text-white">QuickBooks Online</h2>
            {hub ? (
              <>
                <ConnBadge ok={!!hub.quickbooks.connected} />
                <p className="text-xs text-slate-500">
                  OAuth app:{' '}
                  {hub.quickbooks.oauthConfigured || hub.quickbooks.configured
                    ? 'configured'
                    : 'not set'}
                  {hub.quickbooks.companyName ? ` · ${hub.quickbooks.companyName}` : ''}
                </p>
                <p className="text-2xs text-slate-400">
                  See docs/XERO_QBO_GOLIVE.md for redirect URIs and Render secrets.
                </p>
                <Link to="/settings" className="btn-secondary mt-2 inline-flex text-xs">
                  Settings
                </Link>
              </>
            ) : (
              <p className="text-sm text-slate-400">Loading…</p>
            )}
          </div>
        </article>
      </div>

      <div className="metal-tile metal-tile--soft flex items-start gap-3 p-4">
        <ShieldCheckIcon className="h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong>Isolation:</strong> Practice mesh defaults to in-process mock. Live AF requires{' '}
          <code className="text-xs">ACCOUNTFLOW_MESH_ALLOW_LIVE=true</code> and an explicit decision
          — never enabled by this hub.
        </p>
      </div>
    </div>
  );
}
