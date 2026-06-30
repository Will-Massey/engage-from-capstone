import { useEffect, useState } from 'react';
import { SparklesIcon, ChatBubbleLeftRightIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAiAssistantStore } from '../../stores/aiAssistantStore';
import { AiPanel, showAiError } from './AiPanel';
import { AI_COPILOT } from '../../config/aiCopilot';

interface ServiceLine {
  name: string;
  billingFrequency?: string;
  displayPrice?: number;
}

interface ServiceSuggestion {
  serviceId: string;
  name: string;
  rationale: string;
}

type MappableAction =
  | { type: 'title'; value: string }
  | { type: 'coverLetter' }
  | { type: 'suggestServices' };

function parseMappableAction(action: string): MappableAction | null {
  const titleMatch = action.match(/^Suggested title:\s*"(.+)"$/i);
  if (titleMatch) return { type: 'title', value: titleMatch[1] };

  const lower = action.toLowerCase();
  if (
    lower.includes('cover letter') &&
    (lower.includes('missing') ||
      lower.includes('short') ||
      lower.includes('add') ||
      lower.includes('personalised') ||
      lower.includes('personalized'))
  ) {
    return { type: 'coverLetter' };
  }
  if (lower.includes('service') && (lower.includes('add') || lower.includes('suggest') || lower.includes('zero'))) {
    return { type: 'suggestServices' };
  }
  return null;
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
    suggestions?: ServiceSuggestion[];
  } | null;
  onApplySingleSuggestion: (serviceId: string) => void;
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
  onApplySingleSuggestion,
  onDraftCoverLetter,
  coverLoading,
}: ProposalBuilderClaraProps) {
  const openClara = useAiAssistantStore((s) => s.open);
  const [titleLoading, setTitleLoading] = useState(false);
  const [titleSuggestion, setTitleSuggestion] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [draftReview, setDraftReview] = useState<{
    healthScore: number;
    summary: string;
    recommendedActions: string[];
    readyToSend: boolean;
  } | null>(null);
  const [dismissedServiceIds, setDismissedServiceIds] = useState<Set<string>>(new Set());
  const [dismissedActionIndexes, setDismissedActionIndexes] = useState<Set<number>>(new Set());

  useEffect(() => {
    setDraftReview(null);
    setDismissedActionIndexes(new Set());
  }, [step, clientId, proposalTitle, coverLetter, validUntil, services.length]);

  useEffect(() => {
    setDismissedServiceIds(new Set());
  }, [suggestions]);

  const suggestTitle = async () => {
    setTitleLoading(true);
    setTitleSuggestion(null);
    try {
      const res = (await apiClient.aiSuggestTitle(clientId, services)) as any;
      if (res.success && res.data?.title) {
        setTitleSuggestion(res.data.title);
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setTitleLoading(false);
    }
  };

  const runDraftReview = async () => {
    setReviewLoading(true);
    setDismissedActionIndexes(new Set());
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

  const dismissService = (serviceId: string) => {
    setDismissedServiceIds((prev) => new Set([...prev, serviceId]));
  };

  const dismissAction = (index: number) => {
    setDismissedActionIndexes((prev) => new Set([...prev, index]));
  };

  const applyRecommendedAction = (action: string, index: number) => {
    const mapped = parseMappableAction(action);
    if (!mapped) return;

    switch (mapped.type) {
      case 'title':
        onApplyTitle(mapped.value);
        break;
      case 'coverLetter':
        onDraftCoverLetter();
        break;
      case 'suggestServices':
        onSuggestServices();
        break;
    }
    dismissAction(index);
  };

  const visibleSuggestions =
    suggestions?.suggestions?.filter((s) => !dismissedServiceIds.has(s.serviceId)) ?? [];

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
                {visibleSuggestions.length > 0 ? (
                  <ul className="text-xs space-y-2">
                    {visibleSuggestions.map((s) => (
                      <li
                        key={s.serviceId}
                        className="rounded-lg border border-violet-100 dark:border-violet-900/50 bg-white/70 dark:bg-slate-900/50 p-2.5 text-slate-600 dark:text-slate-300"
                      >
                        <p>
                          <strong>{s.name}</strong> — {s.rationale}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => onApplySingleSuggestion(s.serviceId)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800/50 inline-flex items-center gap-1"
                          >
                            <CheckIcon className="h-3 w-3" />
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissService(s.serviceId)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60 inline-flex items-center gap-1"
                          >
                            <XMarkIcon className="h-3 w-3" />
                            Dismiss
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">All service suggestions handled.</p>
                )}
                {visibleSuggestions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      for (const s of visibleSuggestions) {
                        onApplySingleSuggestion(s.serviceId);
                      }
                    }}
                    className="btn-primary text-xs py-1.5 px-3 mt-1"
                  >
                    Accept all remaining
                  </button>
                )}
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
            >
              {titleSuggestion && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-violet-600 dark:text-violet-400 font-medium">
                    Suggested title — review before applying
                  </p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 rounded-lg bg-white/80 dark:bg-slate-900/60 p-3 border border-violet-100 dark:border-violet-900">
                    {titleSuggestion}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onApplyTitle(titleSuggestion);
                        setTitleSuggestion(null);
                      }}
                      className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
                    >
                      <CheckIcon className="h-4 w-4" />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => setTitleSuggestion(null)}
                      className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1"
                    >
                      <XMarkIcon className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </AiPanel>

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
                    <ul className="text-xs space-y-2 text-slate-600 dark:text-slate-300">
                      {draftReview.recommendedActions.map((a, i) => {
                        if (dismissedActionIndexes.has(i)) return null;
                        const mapped = parseMappableAction(a);
                        return (
                          <li
                            key={i}
                            className="rounded-lg border border-violet-100 dark:border-violet-900/50 bg-white/70 dark:bg-slate-900/50 p-2.5"
                          >
                            <p className="flex gap-2">
                              <span className="text-violet-500 shrink-0">→</span>
                              {a}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-2 ml-5">
                              {mapped && (
                                <button
                                  type="button"
                                  onClick={() => applyRecommendedAction(a, i)}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800/50 inline-flex items-center gap-1"
                                >
                                  <CheckIcon className="h-3 w-3" />
                                  Accept
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => dismissAction(i)}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60 inline-flex items-center gap-1"
                              >
                                <XMarkIcon className="h-3 w-3" />
                                Dismiss
                              </button>
                            </div>
                          </li>
                        );
                      })}
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