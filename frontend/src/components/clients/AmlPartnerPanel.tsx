import { useState } from 'react';
import { ShieldCheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';

interface AmlPartnerPanelProps {
  clientId: string;
  clientName: string;
  amlSubmittedAt?: string | null;
  amlCompletedAt?: string | null;
  onUpdated?: () => void;
}

export default function AmlPartnerPanel({
  clientId,
  clientName,
  amlSubmittedAt,
  amlCompletedAt,
  onUpdated,
}: AmlPartnerPanelProps) {
  const [running, setRunning] = useState(false);
  const [lastRef, setLastRef] = useState<string | null>(null);

  const runCheck = async (provider: 'stub' | 'smartsearch' | 'creditsafe' = 'stub') => {
    setRunning(true);
    try {
      const res = (await apiClient.initiateAmlCheck(clientId, provider)) as any;
      if (res.success) {
        setLastRef(res.data?.providerRef || null);
        toast.success(res.message || 'AML check initiated');
        onUpdated?.();
      }
    } catch (e: any) {
      toast.error(e?.message || 'AML check failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="glass-tile p-5 space-y-3"
      data-testid="aml-partner-panel"
    >
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="h-6 w-6 text-emerald-600 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">AML &amp; ID verification</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Initiate a partner AML check for {clientName}. SmartSearch and Creditsafe webhooks update the
            client record when configured on the server.
          </p>
        </div>
      </div>

      {amlCompletedAt ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          AML complete — {new Date(amlCompletedAt).toLocaleDateString('en-GB')}.
        </p>
      ) : amlSubmittedAt ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Client submitted ID details — review before marking complete.
        </p>
      ) : null}

      {lastRef && (
        <p className="text-xs text-slate-500 font-mono">Partner ref: {lastRef}</p>
      )}

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
        >
          SmartSearch
        </button>
        <button
          type="button"
          onClick={() => runCheck('creditsafe')}
          disabled={running}
          className="btn-secondary text-sm"
        >
          Creditsafe
        </button>
      </div>
    </div>
  );
}