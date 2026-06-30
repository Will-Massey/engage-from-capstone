import { SparklesIcon, ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { AI_COPILOT, copilotUnavailableToast } from '../../config/aiCopilot';

interface AiPanelProps {
  title: string;
  description?: string;
  loading?: boolean;
  children?: React.ReactNode;
  onAction?: () => void;
  actionLabel?: string;
  actionDisabled?: boolean;
  configured?: boolean;
}

export function AiPanel({
  title,
  description,
  loading,
  children,
  onAction,
  actionLabel,
  actionDisabled,
  configured = true,
}: AiPanelProps) {
  if (!configured) {
    return (
      <div className="rounded-xl border border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20 p-4">
        <div className="flex items-start gap-3">
          <SparklesIcon className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{title}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {AI_COPILOT.unavailableMessage}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/30 dark:to-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <SparklesIcon className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h4>
            {description && (
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {onAction && (
          <button
            type="button"
            onClick={onAction}
            disabled={loading || actionDisabled}
            className="btn-primary text-xs py-1.5 px-3 shrink-0 inline-flex items-center gap-1.5"
          >
            {loading ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <SparklesIcon className="h-4 w-4" />
            )}
            {actionLabel || 'Generate'}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function AiDraftPreview({
  content,
  onApply,
  onDiscard,
  applyLabel = 'Use draft',
  isStreaming = false,
  onEdit,
  onRegenerate,
}: {
  content: string;
  onApply: () => void;
  onDiscard?: () => void;
  applyLabel?: string;
  isStreaming?: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
}) {
  const showActions = content && !isStreaming;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-violet-600 dark:text-violet-400 font-medium flex items-center gap-1">
        {isStreaming ? (
          <>Clara drafting live <span className="inline-block w-1 h-3 bg-violet-600 animate-pulse ml-0.5" /></>
        ) : (
          'Draft from Clara — review before using'
        )}
      </p>
      <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap max-h-48 overflow-y-auto rounded-lg bg-white/80 dark:bg-slate-900/60 p-3 border border-violet-100 dark:border-violet-900">
        {content}{isStreaming && <span className="inline-block w-1.5 h-3.5 bg-current align-middle ml-0.5 animate-pulse">|</span>}
      </div>

      {showActions && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onApply}
            className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
          >
            <CheckIcon className="h-4 w-4" />
            {applyLabel}
          </button>
          {onEdit && (
            <button type="button" onClick={onEdit} className="btn-secondary text-xs py-1.5 px-3">
              Edit
            </button>
          )}
          {onRegenerate && (
            <button type="button" onClick={onRegenerate} className="btn-secondary text-xs py-1.5 px-3">
              Regenerate
            </button>
          )}
          {onDiscard && (
            <button type="button" onClick={onDiscard} className="btn-secondary text-xs py-1.5 px-3">
              Reject
            </button>
          )}
        </div>
      )}

      {isStreaming && (
        <p className="text-[10px] text-violet-500 dark:text-violet-400">Live preview — you can Apply at any time or wait for Clara to finish.</p>
      )}
      {showActions && onDiscard && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">Accept · Edit · Regenerate · Reject (never overwrites without your action)</p>
      )}
    </div>
  );
}

export function showAiError(error: any) {
  const code = error?.code ?? error?.response?.data?.error?.code;
  const message = error?.message ?? error?.response?.data?.error?.message;
  if (code === 'AI_NOT_CONFIGURED' || code === 'AI_UNAVAILABLE') {
    toast.error(copilotUnavailableToast());
  } else if (message) {
    toast.error(message);
  } else {
    toast.error(`${AI_COPILOT.name} couldn't complete that request`);
  }
}
