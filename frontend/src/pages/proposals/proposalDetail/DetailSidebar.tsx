/**
 * DetailSidebar — AI assist panel, investment summary, valid-until, payment
 * terms, created-by, activity timeline, and the client activity glance. JSX
 * verbatim from the ProposalDetail monolith; all state and handlers come from
 * useProposalDetail().
 */

import { CalendarIcon, UserIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import ProposalAiAssist from '../../../components/ai/ProposalAiAssist';
import { formatCurrency } from '../../../utils/formatters';
import { useProposalDetail } from './ProposalDetailContext';

export default function DetailSidebar() {
  const {
    id,
    proposal,
    activeTab,
    setActiveTab,
    loadProposal,
    groupTotals,
    pricingBreakdown,
    hasMixedVatRates,
    clientOpenCount,
  } = useProposalDetail();

  return (
    <div className="space-y-6">
      {activeTab === 'overview' && id && (
        <ProposalAiAssist proposal={proposal} onUpdated={loadProposal} />
      )}

      {/* Pricing — monthly, annual, and one-time */}
      <div className="glass-tile p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Investment summary
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
          Fees grouped by how often they are billed. One-time project fees are separate from
          recurring retainers.
        </p>
        <div className="space-y-3">
          {groupTotals.MONTHLY?.total > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-slate-600 dark:text-slate-300">Monthly</span>
              <span className="font-bold text-xl text-primary-600 tabular-nums">
                {formatCurrency(groupTotals.MONTHLY.total)}
                <span className="text-xs font-normal text-slate-500 ml-1">/month</span>
              </span>
            </div>
          )}
          {groupTotals.ANNUALLY?.total > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-slate-600 dark:text-slate-300">Annual</span>
              <span className="font-bold text-xl text-primary-600 tabular-nums">
                {formatCurrency(groupTotals.ANNUALLY.total)}
                <span className="text-xs font-normal text-slate-500 ml-1">/year</span>
              </span>
            </div>
          )}
          {groupTotals.ONE_TIME?.total > 0 && (
            <div className="flex justify-between items-baseline">
              <span className="text-slate-600 dark:text-slate-300">One-time</span>
              <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                {formatCurrency(groupTotals.ONE_TIME.total)}
              </span>
            </div>
          )}

          {(pricingBreakdown.monthlyIncVat > 0 || pricingBreakdown.oneOffIncVat > 0) && (
            <div className="border-t border-white/20 dark:border-slate-600/50 pt-3 space-y-2">
              {pricingBreakdown.monthlyIncVat > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      Recurring subtotal (ex VAT)
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                      {formatCurrency(pricingBreakdown.monthlyExVat)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      Recurring VAT {hasMixedVatRates ? '(mixed)' : `(${proposal.vatRate || 20}%)`}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                      {formatCurrency(pricingBreakdown.monthlyVat)}
                    </span>
                  </div>
                </>
              )}

              {pricingBreakdown.oneOffIncVat > 0 && (
                <>
                  <div className="flex justify-between text-sm pt-1 border-t border-dashed border-white/10 dark:border-slate-600/30">
                    <span className="text-slate-600 dark:text-slate-300">
                      One-time subtotal (ex VAT)
                    </span>
                    <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                      {formatCurrency(pricingBreakdown.oneOffExVat)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">One-time VAT</span>
                    <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                      {formatCurrency(pricingBreakdown.oneOffVat)}
                    </span>
                  </div>
                </>
              )}

              {proposal.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Discount</span>
                  <span className="font-medium text-red-600 dark:text-red-400 tabular-nums">
                    -{formatCurrency(proposal.discountAmount)}
                  </span>
                </div>
              )}

              {pricingBreakdown.oneOffIncVat > 0 && pricingBreakdown.monthlyIncVat > 0 && (
                <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-white/30 dark:border-slate-500/50">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    First payment
                  </span>
                  <span className="font-bold text-xl text-slate-900 dark:text-white tabular-nums tracking-tight">
                    {formatCurrency(pricingBreakdown.monthlyIncVat + pricingBreakdown.oneOffIncVat)}
                  </span>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
            {pricingBreakdown.oneOffIncVat > 0 && pricingBreakdown.monthlyIncVat > 0
              ? 'First payment includes one-time fees plus your first month of recurring services.'
              : pricingBreakdown.oneOffIncVat > 0
                ? 'One-time fees are payable as agreed in your engagement letter.'
                : 'Fees are shown at their actual billing frequency — monthly, quarterly, or annual.'}
          </p>
        </div>
      </div>

      {/* Valid until */}
      <div className="glass-tile p-6">
        <div className="flex items-center gap-2 mb-2">
          <CalendarIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Valid Until</h2>
        </div>
        <p className="text-slate-700 dark:text-slate-300">
          {format(new Date(proposal.validUntil), 'dd MMMM yyyy')}
        </p>
        {new Date(proposal.validUntil) < new Date() && proposal.status !== 'ACCEPTED' && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">Expired</p>
        )}
      </div>

      {/* Payment terms */}
      <div className="glass-tile p-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Payment Terms
        </h2>
        <p className="text-slate-700 dark:text-slate-300">{proposal.paymentTerms}</p>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Frequency: {proposal.paymentFrequency?.toLowerCase()}
        </p>
      </div>

      {/* Created by */}
      <div className="glass-tile p-6">
        <div className="flex items-center gap-2 mb-2">
          <UserIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Created By</h2>
        </div>
        <p className="text-slate-700 dark:text-slate-300">
          {proposal.createdBy?.firstName} {proposal.createdBy?.lastName}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">{proposal.createdBy?.email}</p>
      </div>

      {proposal.activityLogs?.length > 0 && (
        <div className="glass-tile p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Activity timeline
          </h2>
          <ul className="space-y-3 max-h-64 overflow-y-auto">
            {proposal.activityLogs.map((log: any) => (
              <li key={log.id} className="text-sm border-l-2 border-primary-500/40 pl-3">
                <p className="text-slate-800 dark:text-slate-200">
                  {log.description || log.action}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm')}
                  {log.user
                    ? ` · ${log.user.firstName || ''} ${log.user.lastName || ''}`.trim()
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Client opens (public link only) — quick glance; full history below */}
      {proposal.status !== 'DRAFT' && (
        <div className="glass-tile p-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Client activity
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Client opened the shared proposal{' '}
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {clientOpenCount}
            </span>{' '}
            {clientOpenCount === 1 ? 'time' : 'times'}
            {proposal.lastViewedAt && (
              <>
                . Last:{' '}
                <span className="text-slate-800 dark:text-slate-200">
                  {format(new Date(proposal.lastViewedAt), 'dd MMM yyyy, HH:mm')}
                </span>
              </>
            )}
            .
          </p>
          <p className="text-[10px] text-primary-600 dark:text-primary-400 mt-2">
            <button type="button" onClick={() => setActiveTab('audit')} className="hover:underline">
              Open Access &amp; Signature History
            </button>{' '}
            for IP addresses, timestamps, and signature forensics.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 leading-relaxed">
            Counts update only via the public client link. Internal views do not count.
          </p>
        </div>
      )}
    </div>
  );
}
