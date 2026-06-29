import { useCallback, useEffect, useState } from 'react';
import { ArrowPathIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { AI_COPILOT } from '../../config/aiCopilot';
import { showAiError } from './AiPanel';

export interface ClientBriefData {
  brief: string;
  highlights: string[];
  requiresApproval?: boolean;
}

interface ClientContextCardProps {
  clientId: string;
  clientName?: string;
  configured?: boolean;
  className?: string;
}

export default function ClientContextCard({
  clientId,
  clientName,
  configured = true,
  className = '',
}: ClientContextCardProps) {
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<ClientBriefData | null>(null);

  const loadBrief = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = (await apiClient.aiClientBrief(clientId)) as any;
      if (res.success) setBrief(res.data);
    } catch (e: any) {
      if (e?.code !== 'NOT_FOUND' && e?.status !== 404) {
        showAiError(e);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    setBrief(null);
    if (configured && clientId) loadBrief();
  }, [clientId, configured, loadBrief]);

  if (!configured) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/40 dark:bg-violet-950/20 p-4 ${className}`}
      >
        <div className="flex items-start gap-2">
          <SparklesIcon className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Client context</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {AI_COPILOT.unavailableMessage}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-violet-200 dark:border-violet-800/60 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/40 dark:to-slate-900/60 p-4 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <SparklesIcon className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Client context</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {clientName ? `Brief for ${clientName}` : 'Companies House & engagement history'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadBrief}
          disabled={loading}
          className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-50"
          title="Refresh brief"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading && !brief ? (
        <div className="space-y-2 animate-pulse" aria-busy="true">
          <div className="h-3 bg-violet-100 dark:bg-violet-900/40 rounded w-full" />
          <div className="h-3 bg-violet-100 dark:bg-violet-900/40 rounded w-5/6" />
          <div className="h-3 bg-violet-100 dark:bg-violet-900/40 rounded w-4/6" />
          <p className="text-xs text-violet-600 dark:text-violet-400 pt-1">
            {AI_COPILOT.name} is researching this client…
          </p>
        </div>
      ) : brief ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {brief.brief}
          </p>
          {brief.highlights?.length > 0 && (
            <ul className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
              {brief.highlights.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-violet-500 shrink-0">•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">No brief available yet.</p>
      )}
    </div>
  );
}