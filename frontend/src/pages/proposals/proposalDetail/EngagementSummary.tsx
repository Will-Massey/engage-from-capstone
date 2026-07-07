/**
 * EngagementSummary — post-sign payment collection status, client engagement
 * at-a-glance chips, and the Proposal / Access & Signature tab bar. JSX verbatim
 * from the ProposalDetail monolith; state comes from useProposalDetail().
 */

import {
  ClockIcon,
  EyeIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  CreditCardIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import { format, formatDistanceToNow } from 'date-fns';
import { useProposalDetail } from './ProposalDetailContext';

const paymentStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  NOT_STARTED: { label: 'Not started', color: 'text-slate-700', bg: 'bg-slate-100' },
  PENDING: { label: 'Pending setup', color: 'text-amber-800', bg: 'bg-amber-100' },
  ACTIVE: { label: 'Mandate active', color: 'text-emerald-800', bg: 'bg-emerald-100' },
  PAID: { label: 'Paid', color: 'text-emerald-800', bg: 'bg-emerald-100' },
  FAILED: { label: 'Failed', color: 'text-red-800', bg: 'bg-red-100' },
  CANCELLED: { label: 'Cancelled', color: 'text-slate-700', bg: 'bg-slate-100' },
  SKIPPED: { label: 'Skipped by client', color: 'text-slate-600', bg: 'bg-slate-100' },
};

export default function EngagementSummary() {
  const {
    proposal,
    activeTab,
    setActiveTab,
    clientOpenCount,
    firstViewedAt,
    lastViewedAt,
    signedAt,
    auditEventCount,
  } = useProposalDetail();

  return (
    <>
      {/* Payment collection status (post-sign mandate) */}
      {proposal.status === 'ACCEPTED' && (
        <div data-testid="payment-collection-status" className="glass-tile p-5 print:hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-sky-100 dark:bg-sky-900/40 p-2">
                <CreditCardIcon className="h-5 w-5 text-sky-600 dark:text-sky-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Payment collection
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Direct Debit / card mandate status after sign
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                paymentStatusConfig[proposal.paymentStatus || 'NOT_STARTED']?.bg || 'bg-slate-100'
              } ${
                paymentStatusConfig[proposal.paymentStatus || 'NOT_STARTED']?.color ||
                'text-slate-700'
              }`}
            >
              {paymentStatusConfig[proposal.paymentStatus || 'NOT_STARTED']?.label || 'Not started'}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            {proposal.paymentProvider && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Provider</dt>
                <dd className="font-medium text-slate-900 dark:text-white capitalize">
                  {proposal.paymentProvider === 'gocardless_stub'
                    ? 'GoCardless (demo)'
                    : proposal.paymentProvider}
                </dd>
              </div>
            )}
            {proposal.paymentMandateId && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Mandate ID</dt>
                <dd className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate">
                  {proposal.paymentMandateId}
                </dd>
              </div>
            )}
            {proposal.paymentMethod && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Method</dt>
                <dd className="font-medium text-slate-900 dark:text-white capitalize">
                  {String(proposal.paymentMethod).replace(/_/g, ' ')}
                </dd>
              </div>
            )}
            {proposal.paidAt && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Activated</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {format(new Date(proposal.paidAt), 'dd MMM yyyy, HH:mm')}
                </dd>
              </div>
            )}
          </dl>

          {proposal.paymentStatus === 'PENDING' && proposal.paymentUrl && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <BanknotesIcon className="h-4 w-4" />
              Awaiting client to complete payment setup via the public proposal link.
            </p>
          )}

          {!proposal.paymentStatus && proposal.total > 0 && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              No mandate yet. Enable &quot;Collect payment at sign&quot; in Settings → Billing to
              prompt clients after acceptance.
            </p>
          )}
        </div>
      )}

      {/* Client engagement at a glance */}
      {proposal.status !== 'DRAFT' && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {clientOpenCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-800 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200">
              <EyeIcon className="h-3.5 w-3.5" />
              Opened {clientOpenCount} {clientOpenCount === 1 ? 'time' : 'times'}
            </span>
          )}
          {firstViewedAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              <ClockIcon className="h-3.5 w-3.5 text-slate-400" />
              First opened {format(firstViewedAt, 'dd MMM yyyy, HH:mm')}
            </span>
          )}
          {lastViewedAt && clientOpenCount !== 1 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              <EyeIcon className="h-3.5 w-3.5 text-slate-400" />
              Last opened {formatDistanceToNow(lastViewedAt, { addSuffix: true })}
            </span>
          )}
          {signedAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              <PencilSquareIcon className="h-3.5 w-3.5" />
              Signed {format(signedAt, 'dd MMM yyyy, HH:mm')}
            </span>
          )}
          {proposal.status === 'SENT' && clientOpenCount === 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Awaiting client to open the link
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700 print:hidden">
        <nav className="flex gap-1" aria-label="Proposal sections">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-primary-500 text-primary-700 dark:text-primary-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Proposal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-primary-500 text-primary-700 dark:text-primary-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheckIcon className="h-4 w-4" />
            Access &amp; Signature
            {auditEventCount > 0 && (
              <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
                {auditEventCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </>
  );
}
