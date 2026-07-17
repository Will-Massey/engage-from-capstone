import { useEffect, useState } from 'react';
import { ShieldCheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import type { AmlUsageSummary } from '../../types/aml';
import { AML_STATUS_COLOURS, AML_STATUS_LABELS, formatAmlCheckPrice } from '../../utils/amlBadge';

interface AmlPartnerPanelProps {
  clientId: string;
  clientName: string;
  amlSubmittedAt?: string | null;
  amlCompletedAt?: string | null;
  onUpdated?: () => void;
}

type AmlStatusData = {
  amlStatus: string;
  amlProviderRef: string | null;
  amlCheckedAt: string | null;
  provider: string | null;
  mode: 'live' | 'demo';
  lastCheckMessage: string | null;
  config?: {
    mode: 'live' | 'demo';
    smartsearchConfigured: boolean;
    creditsafeConfigured: boolean;
  };
};

const STATUS_LABELS = AML_STATUS_LABELS;
const STATUS_COLOURS = AML_STATUS_COLOURS;

const PROVIDER_LABELS: Record<string, string> = {
  smartsearch: 'SmartSearch',
  creditsafe: 'Creditsafe',
  stub: 'Demo (stub)',
};

export default function AmlPartnerPanel({
  clientId,
  clientName,
  amlSubmittedAt,
  amlCompletedAt,
  onUpdated,
}: AmlPartnerPanelProps) {
  const [running, setRunning] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [status, setStatus] = useState<AmlStatusData | null>(null);
  const [usage, setUsage] = useState<AmlUsageSummary | null>(null);

  const loadStatus = async () => {
    try {
      const res = (await apiClient.getAmlStatus(clientId)) as any;
      if (res.success) {
        setStatus(res.data);
      }
    } catch {
      // Non-blocking — panel still usable for initiating checks
    } finally {
      setLoadingStatus(false);
    }
    try {
      const usageRes = await apiClient.getAmlUsage();
      if (usageRes.success && usageRes.data) {
        setUsage(usageRes.data);
      }
    } catch {
      // Non-blocking — usage is informational
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadStatus is recreated each render; clientId is its only real input
  }, [clientId]);

  const runCheck = async (provider: 'stub' | 'smartsearch' | 'creditsafe' = 'stub') => {
    setRunning(true);
    try {
      const res = (await apiClient.initiateAmlCheck(clientId, provider)) as any;
      if (res.success) {
        toast.success(res.message || 'AML check initiated');
        await loadStatus();
        onUpdated?.();
      }
    } catch (e: any) {
      toast.error(e?.message || 'AML check failed');
    } finally {
      setRunning(false);
    }
  };

  const mode = status?.mode ?? status?.config?.mode ?? 'demo';
  const provider = status?.provider;
  const amlStatus = status?.amlStatus ?? 'NOT_STARTED';

  return (
    <div className="glass-tile p-5 space-y-3" data-testid="aml-partner-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <ShieldCheckIcon className="h-6 w-6 text-emerald-600 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              AML &amp; ID verification
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Initiate a partner AML check for {clientName}. SmartSearch and Creditsafe webhooks
              update the client record when configured on the server.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              mode === 'live'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
            data-testid="aml-mode-badge"
          >
            {mode === 'live' ? 'Live' : 'Demo'}
          </span>
          {!loadingStatus && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOURS[amlStatus] ?? STATUS_COLOURS.NOT_STARTED}`}
              data-testid="aml-status-badge"
            >
              {STATUS_LABELS[amlStatus] ?? amlStatus}
            </span>
          )}
        </div>
      </div>

      {!loadingStatus && (
        <div className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-900/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <p>
            <span className="font-medium text-slate-700 dark:text-slate-300">Provider:</span>{' '}
            {provider
              ? (PROVIDER_LABELS[provider] ?? provider)
              : mode === 'live'
                ? 'Configured (no check yet)'
                : 'Demo stub'}
          </p>
          {status?.lastCheckMessage && <p>{status.lastCheckMessage}</p>}
          {status?.amlCheckedAt && (
            <p>
              Last checked:{' '}
              {new Date(status.amlCheckedAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          {status?.amlProviderRef && (
            <p className="font-mono truncate" title={status.amlProviderRef}>
              Ref: {status.amlProviderRef}
            </p>
          )}
          {usage && (
            <p data-testid="aml-usage-summary">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Checks this month:
              </span>{' '}
              {usage.totalChecks}
              {formatAmlCheckPrice(usage.perCheckPricePence)
                ? ` · ${formatAmlCheckPrice(usage.perCheckPricePence)} per check`
                : ''}
            </p>
          )}
        </div>
      )}

      {amlCompletedAt ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          AML complete — {new Date(amlCompletedAt).toLocaleDateString('en-GB')}.
        </p>
      ) : amlSubmittedAt ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Client submitted ID details — review before marking complete.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runCheck('stub')}
          disabled={running}
          className="btn-primary text-sm inline-flex items-center gap-2"
        >
          {running ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : null}
          Run AML check (demo)
        </button>
        <button
          type="button"
          onClick={() => runCheck('smartsearch')}
          disabled={running}
          className="btn-secondary text-sm"
          title={
            status?.config?.smartsearchConfigured
              ? 'Submit to SmartSearch'
              : 'Falls back to demo if API key not set'
          }
        >
          SmartSearch
        </button>
        <button
          type="button"
          onClick={() => runCheck('creditsafe')}
          disabled={running}
          className="btn-secondary text-sm"
          title={
            status?.config?.creditsafeConfigured
              ? 'Submit to Creditsafe'
              : 'Falls back to demo if API key not set'
          }
        >
          Creditsafe
        </button>
      </div>
    </div>
  );
}
