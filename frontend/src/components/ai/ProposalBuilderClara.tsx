import { useEffect, useState } from 'react';
import { SparklesIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAiAssistantStore } from '../../stores/aiAssistantStore';
import { AiPanel, showAiError } from './AiPanel';
import { AI_COPILOT } from '../../config/aiCopilot';

interface ServiceLine {
  name: string;
  billingFrequency?: string;
  displayPrice?: number;
}

interface ProposalBuilderClaraProps {
  step: number;
  clientId: string;
  clientName: string;
  proposalTitle: string;
  coverLetter: string;
  validUntil: string;
  services: ServiceLine[];
  configured: boolean;
  onApplyTitle: (title: string) => void;
  onSuggestServices: () => void;
  suggestLoading: boolean;
  suggestions: {
    summary?: string;
    suggestions?: Array<{ serviceId: string; name: string; rationale: string }>;
  } | null;
  onApplySuggestions: () => void;
  onDraftCoverLetter: () => void;
  coverLoading: boolean;
}

export default function ProposalBuilderClara({
  step,
  clientId,
  clientName,
  proposalTitle,
  coverLetter,
  validUntil,
  services,
  configured,
  onApplyTitle,
  onSuggestServices,
  suggestLoading,
  suggestions,
  onApplySuggestions,
  onDraftCoverLetter,
  coverLoading,
}: ProposalBuilderClaraProps) {
  const openClara = useAiAssistantStore((s) => s.open);
  const [titleLoading, setTitleLoading] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [draftReview, setDraftReview] = useState<{
    healthScore: number;
    summary: string;
    recommendedActions: string[];
    readyToSend: boolean;
  } | null>(null);

  useEffect(() => {
    setDraftReview(null);
  }, [step, clientId, proposalTitle, coverLetter, validUntil, services.length]);

  const suggestTitle = async () => {
    setTitleLoading(true);
    try {
      const res = (await apiClient.aiSuggestTitle(clientId, services)) as any;
      if (res.success && res.data?.title) {
        onApplyTitle(res.data.title);
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setTitleLoading(false);
    }
  };

  const runDraftReview = async () => {
    setReviewLoading(true);
    try {
      const res = (await apiClient.aiDraftReview({
        clientId,
        title: proposalTitle,
        coverLetter,
        validUntil: validUntil || undefined,
        services,
      })) as any;
      if (res.success) setDraftReview(res.data);
    } catch (e) {
      showAiError(e);
    } finally {
      setReviewLoading(false);
    }
  };

  const scoreColor =
    !draftReview
      ? 'text-slate-500'
      : draftReview.healthScore >= 75
        ? 'text-green-600'
        : draftReview.healthScore >= 50
          ? 'text-amber-600'
          : 'text-red-600';

  return (
    <aside className="lg:sticky lg:top-6 h-fit space-y-4 print:hidden">
      <div className="rounded-2xl border border-violet-200 dark:border-violet-800/60 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/40 dark:to-slate-900/60 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <SparklesIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <h3 className="font-semibold text-slate-900 dark:text-white">{AI_COPILOT.name}</h3>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
          Co-pilot for <span className="font-medium">{clientName}</span>
          {step === 2 ? ' — services' : step === 3 ? ' — review before send' : ''}
        </p>

        {step === 2 && (
          <AiPanel
            title="Service bundle"
            description="Recommended services and billing cadence from client context"
            configured={configured}
            loading={suggestLoading}
            onAction={onSuggestServices}
            actionLabel="Suggest services"
          >
            {suggestions && (
              <div className="space-y-2">
                {suggestions.summary && (
                  <p className="text-sm text-slate-700 dark:text-slate-200">{suggestions.summary}</p>
                )}
                <ul className="text-xs space-y-1.5">
                  {suggestions.suggestions?.map((s) => (
                    <li key={s.serviceId} className="text-slate-600 dark:text-slate-300">
                      <strong>{s.name}</strong> — {s.rationale}
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={onApplySuggestions} className="btn-primary text-xs py-1.5 px-3 mt-1">
                  Apply suggestions
                </button>
              </div>
            )}
          </AiPanel>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <AiPanel
              title="Proposal title"
              description="Short professional title for the engagement"
              configured={configured}
              loading={titleLoading}
              onAction={suggestTitle}
              actionLabel={proposalTitle ? 'Refresh title' : 'Suggest title'}
            />

            <AiPanel
              title="Cover letter"
              description="Personalised introduction using your selected services"
              configured={configured}
              loading={coverLoading}
              onAction={onDraftCoverLetter}
              actionLabel={AI_COPILOT.draftWithLabel}
            />

            <AiPanel
              title="Pre-send review"
              description="Checklist before you create or send"
              configured={configured}
              loading={reviewLoading}
              onAction={runDraftReview}
              actionLabel="Run review"
            >
              {draftReview && (
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>
                      {draftReview.healthScore}
                    </span>
                    <span className="text-xs text-slate-500">/ 100</span>
                    {draftReview.readyToSend && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                        Ready
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{draftReview.summary}</p>
                  {draftReview.recommendedActions?.length > 0 && (
                    <ul className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
                      {draftReview.recommendedActions.map((a, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-violet-500 shrink-0">→</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </AiPanel>
          </div>
        )}

        <button
          type="button"
          onClick={openClara}
          className="mt-3 w-full text-xs inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60"
        >
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
          Ask {AI_COPILOT.shortName} anything
        </button>
      </div>
    </aside>
  );
}