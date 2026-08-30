import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
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

type DraftPreview = {
  subject: string;
  bodyHtml: string;
  source?: string;
};

function snippet(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export default function ClaraBoardPriorities() {
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftPreview>>({});

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

  const draftChase = async (item: Item) => {
    setDraftingId(item.jobId);
    try {
      const res = (await apiClient.post(`/jobs/${item.jobId}/clara/draft-chase`)) as any;
      const d = res?.data ?? res;
      const preview: DraftPreview = {
        subject: d.subject,
        bodyHtml: d.bodyHtml,
        source: d.source,
      };
      if (!preview.subject || !preview.bodyHtml) {
        throw new Error('Clara did not return a draft');
      }
      setDrafts((prev) => ({ ...prev, [item.jobId]: preview }));
      toast.success(`Chase drafted for ${item.clientName}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e.message || 'Could not draft chase');
    } finally {
      setDraftingId(null);
    }
  };

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

  return (
    <div className="metal-tile metal-tile--mint overflow-hidden" data-testid="clara-board-priorities">
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
              <p className="mt-0.5 text-xs text-slate-500">
                {summary || 'Board looks calm — no high-risk open jobs.'}
              </p>
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

        {items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Nothing urgent. Clara will surface overdue, records-waiting, and help-needed jobs here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200/60 dark:divide-slate-700/60">
            {items.map((item, idx) => {
              const draft = drafts[item.jobId];
              return (
                <li key={item.jobId} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                      <button
                        type="button"
                        className="btn-accent text-xs py-1"
                        disabled={draftingId === item.jobId}
                        onClick={() => void draftChase(item)}
                        data-testid={`clara-draft-chase-${item.jobId}`}
                      >
                        {draftingId === item.jobId
                          ? 'Drafting…'
                          : draft
                            ? 'Redraft'
                            : 'Draft chase'}
                      </button>
                      <Link to={`/jobs/${item.jobId}`} className="btn-secondary text-xs py-1">
                        Open
                      </Link>
                    </div>
                  </div>
                  {draft && (
                    <div className="mt-2 rounded-lg border border-emerald-200/70 bg-white/70 px-3 py-2 dark:border-emerald-800 dark:bg-slate-900/40">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {draft.subject}
                      </p>
                      {draft.source && (
                        <p className="text-2xs text-emerald-700 dark:text-emerald-300">
                          via {draft.source}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {snippet(draft.bodyHtml)}
                        {snippet(draft.bodyHtml).length >= 160 ? '…' : ''}
                      </p>
                      <Link
                        to={`/jobs/${item.jobId}`}
                        className="mt-1 inline-block text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-300"
                      >
                        Open job to send →
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
