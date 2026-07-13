/**
 * DetailHeader — status banners (rescinded / archived / lost), back link, title
 * with status + approval badges, and the actions toolbar. JSX verbatim from the
 * ProposalDetail monolith; all state and handlers come from useProposalDetail().
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PencilIcon,
  EnvelopeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  BuildingOfficeIcon,
  LinkIcon,
  ShieldCheckIcon,
  NoSymbolIcon,
  TrashIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { DECLINE_REASON_LABELS, type DeclineReason } from '../../../constants/declineReasons';
import { apiClient } from '../../../utils/api';
import { amlStatusColour, amlStatusLabel } from '../../../utils/amlBadge';
import { useProposalDetail } from './ProposalDetailContext';

export default function DetailHeader() {
  const {
    id,
    tenant,
    proposal,
    status,
    StatusIcon,
    approvalStatus,
    approvalStatusUi,
    isApprover,
    canSubmitForApproval,
    canSendDraft,
    showClientLinkButton,
    canWithdrawProposal,
    canMarkAsLost,
    canDeleteProposal,
    canManageProposal,
    canEditCoverLetter,
    downloadPDF,
    handleCopyClientLink,
    copyingLink,
    handleCopyPortalLink,
    copyingPortalLink,
    handleSubmitForApproval,
    handleApproveProposal,
    approvalActionLoading,
    setShowRejectModal,
    openSendFlow,
    setShowWithdrawModal,
    withdrawLoading,
    setShowMarkLostModal,
    markLostLoading,
    setShowDeleteModal,
    deleteLoading,
  } = useProposalDetail();

  // R2.3 — AML badge shown only when the tenant blocks sending until AML clear.
  const [amlGateEnabled, setAmlGateEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await apiClient.getTenantSettings()) as any;
        if (!cancelled && res?.success) {
          setAmlGateEnabled(res.data?.proposals?.blockSendUntilAmlCleared === true);
        }
      } catch {
        // Badge is informational — ignore load failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clientAmlStatus: string | undefined = proposal.client?.amlStatus;

  return (
    <>
      {proposal.status === 'WITHDRAWN' && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
            <ArchiveBoxIcon className="h-5 w-5 shrink-0 mt-0.5" />
            <span>
              This quotation was rescinded — your client cannot sign it. Edit the proposal, then
              send again when you are ready.
            </span>
          </div>
          {canEditCoverLetter && (
            <Link to={`/proposals/${id}/edit`} className="btn-secondary text-sm shrink-0">
              <PencilIcon className="h-4 w-4 mr-1.5" />
              Edit proposal
            </Link>
          )}
        </div>
      )}

      {proposal.status === 'ARCHIVED' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <ArchiveBoxIcon className="h-5 w-5 shrink-0 mt-0.5" />
            <span>
              This signed proposal was archived when a renewal quotation was created.
              {proposal.supersededById && (
                <>
                  {' '}
                  <Link
                    to={`/proposals/${proposal.supersededById}`}
                    className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                  >
                    View renewal quotation
                  </Link>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {proposal.status === 'LOST' && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30 px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-red-900 dark:text-red-100">
            <XMarkIcon className="h-5 w-5 shrink-0 mt-0.5" />
            <span>
              Marked as lost
              {proposal.declineReason && (
                <>
                  {' '}
                  —{' '}
                  {DECLINE_REASON_LABELS[proposal.declineReason as DeclineReason] ||
                    proposal.declineReason}
                </>
              )}
              {proposal.declineReasonText ? `: ${proposal.declineReasonText}` : ''}.
            </span>
          </div>
        </div>
      )}

      {/* Header — back link + breadcrumbs come from the global page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {proposal.title}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
            >
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.label}
            </span>
            {proposal.status === 'DRAFT' && approvalStatus !== 'NONE' && (
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${approvalStatusUi.bg} ${approvalStatusUi.color}`}
              >
                <ShieldCheckIcon className="h-3 w-3 mr-1" />
                {approvalStatusUi.label}
              </span>
            )}
            {amlGateEnabled && clientAmlStatus && (
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${amlStatusColour(clientAmlStatus)}`}
                title="Client AML status — sending requires AML clearance"
                data-testid="proposal-aml-badge"
              >
                <ShieldCheckIcon className="h-3 w-3 mr-1" />
                AML: {amlStatusLabel(clientAmlStatus)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {proposal.reference} • Created {format(new Date(proposal.createdAt), 'dd MMM yyyy')}
          </p>
          {approvalStatus === 'PENDING' && proposal.submittedForApprovalAt && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Submitted{' '}
              {formatDistanceToNow(new Date(proposal.submittedForApprovalAt), { addSuffix: true })}
              {proposal.createdBy
                ? ` by ${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`
                : ''}
            </p>
          )}
          {approvalStatus === 'REJECTED' && proposal.rejectionReason && (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              Rejection reason: {proposal.rejectionReason}
            </p>
          )}
          {approvalStatus === 'APPROVED' && proposal.approvedBy && (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
              Approved by {proposal.approvedBy.firstName} {proposal.approvedBy.lastName}
              {proposal.approvedAt
                ? ` on ${format(new Date(proposal.approvedAt), 'dd MMM yyyy')}`
                : ''}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={downloadPDF} className="btn-secondary" title="Download PDF">
            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
            PDF
          </button>

          {showClientLinkButton && (
            <button
              type="button"
              onClick={handleCopyClientLink}
              disabled={copyingLink}
              className="btn-secondary"
              title="Copy a link your client can open (counts opens when they use it)"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              {copyingLink ? 'Creating…' : 'Copy client link'}
            </button>
          )}

          {proposal.clientId && (
            <button
              type="button"
              onClick={handleCopyPortalLink}
              disabled={copyingPortalLink}
              className="btn-secondary"
              title="Copy client portal link — shows all their proposals"
            >
              <BuildingOfficeIcon className="h-4 w-4 mr-2" />
              {copyingPortalLink ? 'Creating…' : 'Copy portal link'}
            </button>
          )}

          {canSubmitForApproval && (
            <button
              type="button"
              onClick={handleSubmitForApproval}
              disabled={approvalActionLoading}
              className="btn-secondary"
            >
              <ShieldCheckIcon className="h-4 w-4 mr-2" />
              Submit for partner approval
            </button>
          )}

          {proposal.status === 'DRAFT' && approvalStatus === 'PENDING' && isApprover && (
            <>
              <button
                type="button"
                onClick={handleApproveProposal}
                disabled={approvalActionLoading}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckIcon className="h-4 w-4 mr-2" />
                Approve
              </button>
              <button
                type="button"
                onClick={() => setShowRejectModal(true)}
                disabled={approvalActionLoading}
                className="btn-secondary text-red-700 border-red-200 hover:bg-red-50"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Reject
              </button>
            </>
          )}

          {canSendDraft && (
            <button
              onClick={openSendFlow}
              className="btn-primary"
              style={{ backgroundColor: tenant?.primaryColor || '#0ea5e9' }}
            >
              <EnvelopeIcon className="h-4 w-4 mr-2" />
              Send
            </button>
          )}

          {canWithdrawProposal && canManageProposal && (
            <button
              type="button"
              onClick={() => setShowWithdrawModal(true)}
              disabled={withdrawLoading}
              className="btn-secondary text-amber-800 border-amber-200 hover:bg-amber-50 dark:text-amber-200 dark:border-amber-800 dark:hover:bg-amber-950/30"
            >
              <NoSymbolIcon className="h-4 w-4 mr-2" />
              Rescind proposal
            </button>
          )}

          {canMarkAsLost && canManageProposal && (
            <button
              type="button"
              onClick={() => setShowMarkLostModal(true)}
              disabled={markLostLoading}
              className="btn-secondary text-red-700 border-red-200 hover:bg-red-50 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              <XMarkIcon className="h-4 w-4 mr-2" />
              Mark as lost
            </button>
          )}

          {canDeleteProposal && canManageProposal && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={deleteLoading}
              className="btn-secondary text-red-700 border-red-200 hover:bg-red-50 dark:text-red-300 dark:border-red-800 dark:hover:bg-red-950/30"
            >
              <TrashIcon className="h-4 w-4 mr-2" />
              Delete
            </button>
          )}

          {canWithdrawProposal && (
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById('electronic-signature-section')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                toast(
                  'A forensic audit trail requires an electronic signature. Use the signature pad below.',
                  { icon: '✍️', duration: 5000 }
                );
              }}
              className="btn-primary bg-green-600 hover:bg-green-700"
            >
              <CheckIcon className="h-4 w-4 mr-2" />
              Accept with signature
            </button>
          )}
        </div>
      </div>
    </>
  );
}
