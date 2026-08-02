import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCardIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { MoneyPill, StatusChip } from '../ui/StatusChip';

type DunningItem = {
  kind: 'recurring_failed' | 'unpaid_accepted';
  proposalId: string | null;
  reference: string | null;
  title: string | null;
  clientName: string | null;
  clientId: string | null;
  contactEmail: string | null;
  amountPence: number;
  invoiceId: string | null;
  billingPortalAvailable: boolean;
  failedAt: string | null;
  paymentStatus?: string | null;
};

function formatGbp(pence: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(pence / 100);
}

export default function DunningQueue() {
  const [failed, setFailed] = useState<DunningItem[]>([]);
  const [unpaid, setUnpaid] = useState<DunningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = (await apiClient.get('/payments/dunning-queue')) as any;
      const data = res?.data ?? res;
      setFailed(data?.failed || []);
      setUnpaid(data?.unpaid || []);
    } catch {
      setFailed([]);
      setUnpaid([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function openPortal(proposalId: string) {
    setBusyId(proposalId);
    setMsg(null);
    try {
      const res = (await apiClient.post(
        `/payments/proposals/${proposalId}/billing-portal`
      )) as any;
      const url = res?.data?.url ?? res?.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else setMsg('No portal URL returned');
    } catch (e: any) {
      setMsg(e?.response?.data?.error?.message || e.message || 'Portal failed');
    } finally {
      setBusyId(null);
    }
  }

  async function retry(item: DunningItem) {
    if (!item.proposalId) return;
    setBusyId(item.proposalId);
    setMsg(null);
    try {
      const res = (await apiClient.post(
        `/payments/proposals/${item.proposalId}/dunning-retry`,
        { invoiceId: item.invoiceId }
      )) as any;
      const data = res?.data ?? res;
      setMsg(data?.message || res?.message || 'Retry complete');
      if (data?.portalUrl) window.open(data.portalUrl, '_blank', 'noopener,noreferrer');
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error?.message || e.message || 'Retry failed');
    } finally {
      setBusyId(null);
    }
  }

  const items = [...failed, ...unpaid].slice(0, 12);
  if (loading) {
    return (
      <div className="metal-tile p-5 animate-pulse">
        <div className="h-5 w-36 rounded bg-slate-200" />
        <div className="mt-3 h-20 rounded bg-slate-100" />
      </div>
    );
  }

  return (
    <div
      className={`metal-tile overflow-hidden ${items.length ? 'metal-tile--rose' : 'metal-tile--mint'}`}
    >
      <span className="metal-specular" aria-hidden />
      <div className="relative z-[1] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCardIcon
              className={`h-5 w-5 ${items.length ? 'text-rose-600' : 'text-emerald-600'}`}
            />
            <div>
              <p
                className={`metal-kicker ${items.length ? 'text-rose-800/80' : 'text-emerald-800/80'}`}
              >
                Dunning
              </p>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Collection queue
              </h3>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
            onClick={() => void load()}
          >
            <ArrowPathIcon className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
        {msg && (
          <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
            {msg}
          </p>
        )}
        {!items.length && (
          <p className="mt-3 text-sm text-slate-500">
            No failed recurring payments or unpaid accepted proposals. When clients pay late,
            Retry and Portal actions appear here.
          </p>
        )}
        <ul className="mt-3 divide-y divide-slate-200/60 dark:divide-slate-700/50">
          {items.map((item, i) => (
            <li
              key={`${item.kind}-${item.proposalId}-${i}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusChip tone={item.kind === 'recurring_failed' ? 'danger' : 'warning'}>
                    {item.kind === 'recurring_failed' ? 'Failed' : 'Unpaid'}
                  </StatusChip>
                  {item.clientId ? (
                    <Link
                      to={`/clients/${item.clientId}`}
                      className="font-medium text-slate-900 hover:text-emerald-700 dark:text-white"
                    >
                      {item.clientName}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.clientName || 'Client'}</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {item.reference} · {item.title}
                  {item.contactEmail ? ` · ${item.contactEmail}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <MoneyPill pence={item.amountPence} emphasize />
                {item.proposalId && item.billingPortalAvailable && (
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1"
                    disabled={busyId === item.proposalId}
                    onClick={() => void openPortal(item.proposalId!)}
                  >
                    Portal
                  </button>
                )}
                {item.proposalId && item.kind === 'recurring_failed' && (
                  <button
                    type="button"
                    className="btn-accent text-xs py-1"
                    disabled={busyId === item.proposalId}
                    onClick={() => void retry(item)}
                  >
                    {busyId === item.proposalId ? '…' : 'Retry'}
                  </button>
                )}
                {item.proposalId && (
                  <Link
                    to={`/proposals/${item.proposalId}?tab=audit`}
                    className="btn-secondary text-xs py-1"
                  >
                    Proposal
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-center gap-1 text-2xs text-slate-400">
          <ExclamationTriangleIcon className="h-3 w-3" />
          Retry charges the Stripe invoice when available; Portal lets the client update card.
        </p>
      </div>
    </div>
  );
}
