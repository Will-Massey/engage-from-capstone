import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  CheckIcon,
  XMarkIcon,
  ClockIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import { appPath } from '../../utils/appBase';
import { useAuthStore } from '../../stores/authStore';
import { isApprover } from '../../constants/roles';

interface QueueProposal {
  id: string;
  title: string;
  reference?: string;
  submittedForApprovalAt?: string;
  client?: { id: string; name: string };
  createdBy?: { firstName: string; lastName: string; email: string };
  _count?: { services: number };
}

export default function ApprovalQueue() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<QueueProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await apiClient.getApprovalQueue({ limit: 50 })) as {
        success: boolean;
        data: QueueProposal[];
      };
      if (res.success) setItems(res.data || []);
    } catch {
      toast.error('Could not load approval queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isApprover(user?.role)) return;
    loadQueue();
  }, [user?.role, loadQueue]);

  if (!isApprover(user?.role)) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center text-slate-600 dark:text-slate-400">
        <p>Partner or manager access is required to view the approval queue.</p>
        <Link to={appPath('/proposals')} className="text-primary-600 hover:underline mt-4 inline-block">
          Back to proposals
        </Link>
      </div>
    );
  }

  const handleApprove = async (id: string) => {
    setActingId(id);
    try {
      await apiClient.approveProposal(id);
      toast.success('Proposal approved');
      await loadQueue();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not approve proposal';
      toast.error(msg);
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Reason for rejection (optional):') ?? '';
    setActingId(id);
    try {
      await apiClient.rejectProposal(id, { rejectionReason: reason || 'Changes requested' });
      toast.success('Proposal returned to draft');
      await loadQueue();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message || 'Could not reject proposal';
      toast.error(msg);
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            to={appPath('/proposals')}
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-2"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Proposals
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Partner approval queue</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Draft proposals submitted by junior staff awaiting your sign-off before send.
          </p>
        </div>
        <button type="button" onClick={loadQueue} className="btn-secondary text-sm" disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading queue…</p>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-slate-600 dark:text-slate-400">
          <ClockIcon className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No proposals awaiting approval.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <article
              key={p.id}
              className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              data-testid="approval-queue-item"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={appPath(`/proposals/${p.id}`)}
                  className="font-semibold text-slate-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400"
                >
                  {p.title}
                </Link>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  {p.client?.name}
                  {p._count?.services != null && ` · ${p._count.services} service${p._count.services === 1 ? '' : 's'}`}
                </p>
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <UserIcon className="w-3.5 h-3.5" />
                  {p.createdBy
                    ? `${p.createdBy.firstName} ${p.createdBy.lastName}`
                    : 'Unknown submitter'}
                  {p.submittedForApprovalAt && (
                    <span>
                      · submitted{' '}
                      {formatDistanceToNow(new Date(p.submittedForApprovalAt), { addSuffix: true })}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Link to={appPath(`/proposals/${p.id}`)} className="btn-secondary text-sm">
                  Review
                </Link>
                <button
                  type="button"
                  className="btn-primary text-sm inline-flex items-center gap-1"
                  disabled={actingId === p.id}
                  onClick={() => handleApprove(p.id)}
                  data-testid="approve-proposal-button"
                >
                  <CheckIcon className="w-4 h-4" />
                  Approve
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm inline-flex items-center gap-1 text-red-700 dark:text-red-300"
                  disabled={actingId === p.id}
                  onClick={() => handleReject(p.id)}
                >
                  <XMarkIcon className="w-4 h-4" />
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}