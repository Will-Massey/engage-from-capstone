/**
 * DetailModals — send email preview dialog plus the delete, rescind, mark-lost,
 * and reject confirmation modals. JSX verbatim from the ProposalDetail monolith;
 * all state and handlers come from useProposalDetail().
 */

import ProposalEmailPreviewDialog from '../../../components/ai/ProposalEmailPreviewDialog';
import {
  DECLINE_REASONS,
  DECLINE_REASON_LABELS,
  type DeclineReason,
} from '../../../constants/declineReasons';
import { useProposalDetail } from './ProposalDetailContext';

export default function DetailModals() {
  const {
    id,
    proposal,
    showSendEmailPreview,
    setShowSendEmailPreview,
    handleSend,
    showDeleteModal,
    setShowDeleteModal,
    deleteLoading,
    handleDeleteProposal,
    showWithdrawModal,
    setShowWithdrawModal,
    withdrawLoading,
    handleWithdrawProposal,
    showMarkLostModal,
    setShowMarkLostModal,
    markLostLoading,
    handleMarkProposalLost,
    markLostReason,
    setMarkLostReason,
    markLostNotes,
    setMarkLostNotes,
    showRejectModal,
    setShowRejectModal,
    rejectionReason,
    setRejectionReason,
    handleRejectProposal,
    approvalActionLoading,
  } = useProposalDetail();

  return (
    <>
      <ProposalEmailPreviewDialog
        open={showSendEmailPreview}
        onClose={() => setShowSendEmailPreview(false)}
        proposalId={id}
        onSend={handleSend}
      />

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Delete quotation
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Permanently remove &quot;{proposal.title}&quot;? This cannot be undone. If the client
              still has a live link, rescind first instead.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteProposal}
                disabled={deleteLoading}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                {deleteLoading ? 'Deleting…' : 'Delete quotation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWithdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Rescind proposal
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              This rescinds the quotation so your client cannot sign it. Their share link will stop
              working immediately. You can edit and resend when ready.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWithdrawProposal}
                disabled={withdrawLoading}
                className="btn-primary bg-amber-600 hover:bg-amber-700"
              >
                {withdrawLoading ? 'Rescinding…' : 'Rescind proposal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMarkLostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Mark quotation as lost
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Record why this quotation did not convert. This feeds your win/loss analytics and
              revokes any live client link.
            </p>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mt-4 mb-1">
              Primary reason
            </label>
            <select
              value={markLostReason}
              onChange={(e) => setMarkLostReason(e.target.value as DeclineReason)}
              className="input-field w-full"
            >
              {DECLINE_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {DECLINE_REASON_LABELS[reason]}
                </option>
              ))}
            </select>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mt-3 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={markLostNotes}
              onChange={(e) => setMarkLostNotes(e.target.value)}
              className="input-field w-full min-h-[80px]"
              placeholder="Any extra context for your records"
              maxLength={500}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowMarkLostModal(false);
                  setMarkLostNotes('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleMarkProposalLost}
                disabled={markLostLoading}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                {markLostLoading ? 'Saving…' : 'Mark as lost'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Reject proposal
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Provide a reason so the drafter knows what to revise before resubmitting.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="input-field w-full mt-4 min-h-[120px]"
              placeholder="Rejection reason (required)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectProposal}
                disabled={approvalActionLoading || !rejectionReason.trim()}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                Reject proposal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
