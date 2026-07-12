import { useEffect, useState } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';

export type ClaraEmptyContext = 'clients' | 'proposals' | 'services' | 'general';

interface ClaraEmptyTipProps {
  /** Context key for /api/ai/empty-suggestion */
  context: ClaraEmptyContext;
  /** Static fallback when AI is unavailable */
  fallback?: string;
  className?: string;
}

export default function ClaraEmptyTip({ context, fallback, className = '' }: ClaraEmptyTipProps) {
  const [tip, setTip] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cacheKey = `clara-empty-tip-${context}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setTip(cached);
      return;
    }

    setLoading(true);
    apiClient
      .aiEmptySuggestion(context)
      .then((res: any) => {
        const text = res?.data?.tip || res?.tip;
        if (text && typeof text === 'string' && text.length > 5) {
          sessionStorage.setItem(cacheKey, text);
          setTip(text);
        }
      })
      .catch(() => {
        // silent — fallback shown below
      })
      .finally(() => setLoading(false));
  }, [context]);

  const displayed = tip || fallback;

  if (!displayed && !loading) return null;

  return (
    <div
      className={`p-3 rounded-lg bg-primary-50 dark:bg-primary-950/30 border border-primary-100 dark:border-primary-900 text-left ${className}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 mb-1">
        <SparklesIcon className="h-3.5 w-3.5" />
        Clara suggests
      </div>
      {loading && !displayed ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 italic">Thinking of a tip…</p>
      ) : (
        <p className="text-sm text-slate-700 dark:text-slate-300">{displayed}</p>
      )}
    </div>
  );
}
