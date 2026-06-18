import { SparklesIcon, ArrowPathIcon, CheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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
              Add <code className="text-violet-600">XAI_API_KEY</code> (or{' '}
              <code className="text-violet-600">OPENAI_API_KEY</code>) to the server environment to
              enable AI assistance.
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
}: {
  content: string;
  onApply: () => void;
  onDiscard?: () => void;
  applyLabel?: string;
}) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-violet-600 dark:text-violet-400 font-medium">
        Draft — review before using
      </p>
      <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap max-h-48 overflow-y-auto rounded-lg bg-white/80 dark:bg-slate-900/60 p-3 border border-violet-100 dark:border-violet-900">
        {content}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onApply} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1">
          <CheckIcon className="h-4 w-4" />
          {applyLabel}
        </button>
        {onDiscard && (
          <button type="button" onClick={onDiscard} className="btn-secondary text-xs py-1.5 px-3">
            Discard
          </button>
        )}
      </div>
    </div>
  );
}

export function showAiError(error: any) {
  const code = error?.response?.data?.error?.code;
  if (code === 'AI_NOT_CONFIGURED') {
    toast.error('AI is not configured on the server (set XAI_API_KEY or OPENAI_API_KEY)');
  } else {
    toast.error(error?.response?.data?.error?.message || 'AI request failed');
  }
}
