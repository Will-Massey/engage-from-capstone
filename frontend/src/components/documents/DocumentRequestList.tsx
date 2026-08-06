import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  NoSymbolIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';

export interface DocumentRequestSummary {
  id: string;
  title: string;
  status: 'OPEN' | 'COMPLETE' | 'CANCELLED';
  sentCount: number;
  lastSentAt: string | null;
  createdAt: string;
  client: { id: string; name: string; contactEmail: string | null };
  job: { id: string; title: string; reference: string } | null;
  items: {
    id: string;
    name: string;
    required: boolean;
    status: 'PENDING' | 'RECEIVED';
    receivedAt: string | null;
  }[];
  progress: {
    itemsTotal: number;
    itemsReceived: number;
    requiredTotal: number;
    requiredReceived: number;
  };
}

function StatusBadge({ status }: { status: DocumentRequestSummary['status'] }) {
  if (status === 'COMPLETE') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 rounded-full px-2 py-0.5">
        <CheckCircleIcon className="h-3.5 w-3.5" /> Complete
      </span>
    );
  }
  if (status === 'CANCELLED') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-500/10 rounded-full px-2 py-0.5">
        <NoSymbolIcon className="h-3.5 w-3.5" /> Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 rounded-full px-2 py-0.5">
      <ClockIcon className="h-3.5 w-3.5" /> Awaiting documents
    </span>
  );
}

interface DocumentRequestListProps {
  requests: DocumentRequestSummary[];
  onChanged: () => void;
  /** Show which client each request belongs to (hub view) */
  showClient?: boolean;
  emptyText?: string;
}

export default function DocumentRequestList({
  requests,
  onChanged,
  showClient,
  emptyText = 'No document requests yet.',
}: DocumentRequestListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (id: string, action: 'resend' | 'cancel') => {
    setBusyId(id);
    try {
      await apiClient.post(`/document-requests/${id}/${action}`, {});
      toast.success(action === 'resend' ? 'Request re-sent.' : 'Request cancelled.');
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || `Could not ${action} the request`);
    } finally {
      setBusyId(null);
    }
  };

  const overrideItem = async (requestId: string, itemId: string, received: boolean) => {
    setBusyId(requestId);
    try {
      await apiClient.patch(`/document-requests/${requestId}/items/${itemId}`, {
        status: received ? 'RECEIVED' : 'PENDING',
      });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Could not update the item');
    } finally {
      setBusyId(null);
    }
  };

  if (!requests.length) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">{emptyText}</p>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <div
          key={r.id}
          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {r.title}
                </h4>
                <StatusBadge status={r.status} />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {showClient && (
                  <>
                    <Link
                      to={`/clients/${r.client.id}?tab=documents`}
                      className="text-emerald-700 dark:text-emerald-300 hover:underline"
                    >
                      {r.client.name}
                    </Link>
                    {' · '}
                  </>
                )}
                {r.progress.itemsReceived}/{r.progress.itemsTotal} received
                {r.job ? ` · ${r.job.reference}` : ''}
                {r.lastSentAt
                  ? ` · sent ${new Date(r.lastSentAt).toLocaleDateString('en-GB')} (×${r.sentCount})`
                  : ' · not sent yet'}
              </p>
            </div>

            {r.status === 'OPEN' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void act(r.id, 'resend')}
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
                  title={r.sentCount ? 'Email the request again' : 'Send the request email'}
                >
                  {r.sentCount ? (
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                  ) : (
                    <PaperAirplaneIcon className="h-3.5 w-3.5" />
                  )}
                  {busyId === r.id ? 'Working…' : r.sentCount ? 'Resend' : 'Send'}
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void act(r.id, 'cancel')}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{
                width: `${r.progress.itemsTotal ? Math.round((r.progress.itemsReceived / r.progress.itemsTotal) * 100) : 0}%`,
              }}
            />
          </div>

          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {r.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={item.status === 'RECEIVED'}
                  disabled={r.status !== 'OPEN' || busyId === r.id}
                  onChange={(e) => void overrideItem(r.id, item.id, e.target.checked)}
                  className="cursor-pointer"
                  title="Tick if received outside the portal"
                />
                <span
                  className={
                    item.status === 'RECEIVED'
                      ? 'text-slate-400 line-through'
                      : 'text-slate-700 dark:text-slate-300'
                  }
                >
                  {item.name}
                  {!item.required && <span className="text-slate-400"> (optional)</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
