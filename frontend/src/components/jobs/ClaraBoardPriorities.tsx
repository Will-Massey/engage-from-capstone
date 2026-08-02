import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { StatusChip, MoneyPill, boardColumnLabel, boardColumnTone } from '../ui/StatusChip';
import { StatusGem } from '../ui/MetalTile';

type Item = {
  jobId: string;
  reference: string;
  title: string;
  clientName: string;
  boardColumn: string;
  dueAt: string | null;
  feePence: number;
  assigneeName: string | null;
  score: number;
  reasons: string[];
  suggestedAction: string;
  suggestedPackId: string | null;
};

export default function ClaraBoardPriorities() {
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await apiClient.get('/clara/prioritise-board', { params: { limit: 6 } })) as any;
      const data = res?.data ?? res;
      setItems(data?.items || []);
      setSummary(data?.summary || '');
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e.message || 'Clara prioritise unavailable');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return (
      <div className="metal-tile metal-tile--mint p-4 animate-pulse">
        <div className="h-4 w-48 rounded bg-emerald-100/80" />
        <div className="mt-3 h-16 rounded bg-slate-100/60" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {error}
      </div>
    );
  }

  if (!items.length) return null;

  return (
    <div className="metal-tile metal-tile--mint overflow-hidden">
      <span className="metal-specular" aria-hidden />
      <span className="metal-glare" aria-hidden />
      <div className="relative z-[1] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <SparklesIcon className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div>
              <p className="metal-kicker text-emerald-800/80 dark:text-emerald-300">Clara</p>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Prioritise this board
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">{summary}</p>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/70 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white dark:border-slate-600 dark:bg-slate-800"
            onClick={() => void load()}
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        <ul className="mt-3 divide-y divide-slate-200/60 dark:divide-slate-700/60">
          {items.map((item, idx) => (
            <li
              key={item.jobId}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusGem tone={idx === 0 ? 'rose' : idx < 3 ? 'amber' : 'mint'}>
                    #{idx + 1}
                  </StatusGem>
                  <Link
                    to={`/jobs/${item.jobId}`}
                    className="truncate font-medium text-slate-900 hover:text-emerald-700 dark:text-white"
                  >
                    {item.clientName}
                  </Link>
                  <StatusChip tone={boardColumnTone(item.boardColumn)}>
                    {boardColumnLabel(item.boardColumn)}
                  </StatusChip>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {item.title} · {item.reasons.join(' · ')}
                  {item.assigneeName ? ` · ${item.assigneeName}` : ' · Unassigned'}
                </p>
                <p className="mt-0.5 text-2xs font-medium text-emerald-800 dark:text-emerald-300">
                  → {item.suggestedAction}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <MoneyPill pence={item.feePence} />
                <Link to={`/jobs/${item.jobId}`} className="btn-secondary text-xs py-1">
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
