import { SparklesIcon } from '@heroicons/react/24/outline';
import { StatusChip } from '../../components/ui/StatusChip';
import type { AiReplyDraft } from './aiReplyHelpers';

type Props = {
  draft: AiReplyDraft;
  busy: boolean;
  onApprove: (draftId: string) => void;
  onEdit: (draft: AiReplyDraft) => void;
  onDismiss: (draftId: string) => void;
};

/**
 * Suggested-reply safety gate: renders a pending AI draft above the reply
 * composer. Nothing here is ever sent — the practice must click Approve
 * (or edit then send) before anything leaves the mailbox.
 */
export function AiReplyCard({ draft, busy, onApprove, onEdit, onDismiss }: Props) {
  return (
    <div className="metal-tile border border-violet-200 p-4 dark:border-violet-900">
      <span className="metal-specular" aria-hidden />
      <div className="relative z-[1] space-y-2">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden />
          <p className="metal-kicker">Suggested reply</p>
          <StatusChip tone="violet" className="ml-auto">
            Awaiting your review
          </StatusChip>
        </div>
        <p className="text-xs text-slate-500">
          AI drafted this from the thread. Nothing sends until you approve or edit it.
        </p>
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-violet-100 bg-violet-50/50 p-3 text-sm text-slate-800 dark:border-violet-900 dark:bg-violet-950/20 dark:text-slate-100">
          {draft.bodyText}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={busy}
            onClick={() => onApprove(draft.id)}
          >
            {busy ? 'Working…' : 'Approve & send'}
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={busy}
            onClick={() => onEdit(draft)}
          >
            Edit then send
          </button>
          <button
            type="button"
            className="btn-ghost text-sm"
            disabled={busy}
            onClick={() => onDismiss(draft.id)}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
