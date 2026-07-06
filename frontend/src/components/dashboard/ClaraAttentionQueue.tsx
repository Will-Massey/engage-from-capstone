import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SparklesIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { AI_COPILOT } from '../../config/aiCopilot';
import { showAiError } from '../ai/AiPanel';

interface AttentionItem {
  proposalId: string;
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

  if (loading) {
    return (
      <div
        className="glass-tile p-6 border border-violet-200 dark:border-violet-900/50 animate-pulse"
        aria-busy="true"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 rounded bg-violet-200 dark:bg-violet-800" />
          <div className="h-5 w-48 rounded bg-violet-100 dark:bg-violet-900/40" />
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
        : 'text-violet-600 dark:text-violet-400';

  return (
    <div className="glass-tile p-6 border border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-white to-violet-50/30 dark:from-slate-900 dark:to-violet-950/20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40">
            <SparklesIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="font-semibold text-lg text-slate-900 dark:text-white">
              {AI_COPILOT.name}&apos;s attention queue
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {items.length} proposal{items.length === 1 ? '' : 's'} need your attention
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

      <div className="space-y-2">
        {items.map((item) => (
          <Link
            key={item.proposalId}
            to={`/proposals/${item.proposalId}`}
            className="group flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-violet-300 hover:bg-violet-50/40 dark:hover:bg-violet-950/20 transition-all"
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <ExclamationTriangleIcon
                className={`h-5 w-5 shrink-0 mt-0.5 ${scoreColour(item.priorityScore)}`}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm text-slate-900 dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-300">
                    {item.clientName}
                  </span>
                  <span className="text-xs text-slate-500">{item.reference}</span>
                  <span
                    className={`text-xs font-bold tabular-nums ${scoreColour(item.priorityScore)}`}
                  >
                    {item.priorityScore}
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">{item.narrative}</p>
                <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">
                  {item.recommendedAction}
                </p>
              </div>
            </div>
            <span className="text-violet-600 opacity-70 group-hover:opacity-100 transition shrink-0 text-sm">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
