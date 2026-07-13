import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SparklesIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { AI_COPILOT } from '../../config/aiCopilot';
import { showAiError } from '../ai/AiPanel';

interface AttentionItem {
  kind?: 'proposal' | 'regulatory' | 'clara_draft';
  proposalId?: string;
  signalId?: string;
  clientId?: string;
  reference: string;
  title: string;
  clientName: string;
  status: string;
  priorityScore: number;
  reason: string;
  narrative: string;
  recommendedAction: string;
}

export default function ClaraAttentionQueue() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = (await apiClient.aiAttentionQueue()) as any;
      if (res.success) {
        setItems(res.data?.items || []);
        setGeneratedAt(res.data?.generatedAt || null);
      }
    } catch (e) {
      showAiError(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const dismissSignal = async (signalId: string) => {
    setDismissingId(signalId);
    try {
      await apiClient.dismissRegulatorySignal(signalId);
      await loadQueue();
    } catch (e) {
      showAiError(e);
    } finally {
      setDismissingId(null);
    }
  };

  if (loading) {
    return (
      <div
        className="glass-tile p-6 border border-primary-200 dark:border-primary-900/50 animate-pulse"
        aria-busy="true"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 rounded bg-primary-200 dark:bg-primary-800" />
          <div className="h-5 w-48 rounded bg-primary-100 dark:bg-primary-900/40" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800/40" />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) return null;

  const scoreColour = (score: number) =>
    score >= 80
      ? 'text-red-600 dark:text-red-400'
      : score >= 60
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-primary-600 dark:text-primary-400';

  const scoreDot = (score: number) =>
    score >= 80 ? 'bg-red-500' : score >= 60 ? 'bg-amber-500' : 'bg-primary-500';

  return (
    <div className="glass-tile p-6 border border-primary-200 dark:border-primary-900/50 bg-gradient-to-br from-white to-primary-50/30 dark:from-slate-900 dark:to-primary-950/20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/40">
            <SparklesIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="font-semibold text-lg text-slate-900 dark:text-white">
              {AI_COPILOT.name}&apos;s attention queue
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {items.length} item{items.length === 1 ? '' : 's'} need your attention
              {generatedAt && (
                <span>
                  {' '}
                  · updated{' '}
                  {new Date(generatedAt).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadQueue}
            className="btn-secondary text-sm inline-flex items-center gap-1"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
          <Link to="/proposals" className="btn-primary text-sm">
            View proposals
          </Link>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
        {items.map((item) => {
          const isRegulatory = item.kind === 'regulatory';
          const isClaraDraft = item.kind === 'clara_draft';
          const linkTo =
            isRegulatory && item.clientId
              ? `/clients/${item.clientId}`
              : `/proposals/${item.proposalId}`;
          return (
            <Link
              key={item.proposalId || item.signalId}
              to={linkTo}
              className="group flex items-start gap-3 py-3 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${scoreDot(item.priorityScore)}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-slate-900 dark:text-white truncate group-hover:text-primary-700 dark:group-hover:text-primary-300">
                    {item.clientName}
                  </span>
                  {isRegulatory ? (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      Regulatory
                    </span>
                  ) : isClaraDraft ? (
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                      Clara draft
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-500">{item.reference}</span>
                  )}
                  <span
                    className={`ml-auto shrink-0 text-xs font-bold tabular-nums ${scoreColour(item.priorityScore)}`}
                  >
                    {item.priorityScore}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                  {item.narrative}
                </p>
              </div>
              <span className="flex items-center gap-1.5 shrink-0 self-center text-sm">
                {isRegulatory && item.signalId && (
                  <button
                    type="button"
                    title="Dismiss this regulatory signal"
                    aria-label="Dismiss this regulatory signal"
                    disabled={dismissingId === item.signalId}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dismissSignal(item.signalId!);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition disabled:opacity-50"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
                <span className="text-primary-600 opacity-70 group-hover:opacity-100 transition whitespace-nowrap">
                  Open →
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
