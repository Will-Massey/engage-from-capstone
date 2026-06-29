import { useState } from 'react';
import {
  SparklesIcon,
  CheckIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import { AI_COPILOT } from '../../config/aiCopilot';

export interface AutoFitServiceSuggestion {
  serviceId: string;
  name: string;
  billingFrequency: string;
  displayPrice: number;
  rationale: string;
}

export interface AutoFitResult {
  suggestedTitle: string;
  services: AutoFitServiceSuggestion[];
  coverLetterTone: 'PROFESSIONAL' | 'FRIENDLY' | 'MODERN';
  coverLetterDraft: string;
  pricingNotes: string;
  validUntilDays: number;
}

type SectionKey = 'title' | 'services' | 'coverLetter' | 'pricing' | 'validUntil';

interface AutoFitBannerProps {
  clientName: string;
  result: AutoFitResult | null;
  loading?: boolean;
  configured?: boolean;
  onAcceptAll: () => void;
  onAcceptSection: (section: SectionKey) => void;
  onDismiss: () => void;
}

const SECTION_LABELS: Record<SectionKey, string> = {
  title: 'Proposal title',
  services: 'Service bundle',
  coverLetter: 'Cover letter',
  pricing: 'Pricing notes',
  validUntil: 'Valid until',
};

export default function AutoFitBanner({
  clientName,
  result,
  loading,
  configured = true,
  onAcceptAll,
  onAcceptSection,
  onDismiss,
}: AutoFitBannerProps) {
  const [expanded, setExpanded] = useState(true);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);

  const sections: SectionKey[] = ['title', 'services', 'coverLetter', 'pricing', 'validUntil'];

  if (!configured || (!loading && !result)) return null;

  const currentSection = sections[reviewIndex];

  const renderSectionPreview = (key: SectionKey) => {
    if (!result) return null;
    switch (key) {
      case 'title':
        return <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{result.suggestedTitle}</p>;
      case 'services':
        return (
          <ul className="text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
            {result.services.map((s) => (
              <li key={s.serviceId}>
                <strong>{s.name}</strong> — £{s.displayPrice.toLocaleString('en-GB')} ({s.billingFrequency.replace(/_/g, ' ').toLowerCase()})
                <span className="block text-slate-500">{s.rationale}</span>
              </li>
            ))}
          </ul>
        );
      case 'coverLetter':
        return (
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-violet-600 dark:text-violet-400">
              Tone: {result.coverLetterTone}
            </span>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap max-h-32 overflow-y-auto">
              {result.coverLetterDraft}
            </p>
          </div>
        );
      case 'pricing':
        return <p className="text-sm text-slate-700 dark:text-slate-200">{result.pricingNotes}</p>;
      case 'validUntil':
        return (
          <p className="text-sm text-slate-700 dark:text-slate-200">
            Valid for {result.validUntilDays} days from today
          </p>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-2xl border border-violet-300/70 dark:border-violet-700/60 bg-gradient-to-r from-violet-50 via-white to-indigo-50/80 dark:from-violet-950/50 dark:via-slate-900/60 dark:to-indigo-950/30 p-4 shadow-sm mb-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-400/25 shrink-0">
            <SparklesIcon className={`h-5 w-5 text-violet-600 dark:text-violet-400 ${loading ? 'animate-pulse' : ''}`} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {loading
                ? `${AI_COPILOT.name} is fitting a proposal for ${clientName}…`
                : `${AI_COPILOT.name} suggested a starter proposal`}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Review each section before applying — nothing is overwritten without your approval.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!loading && result && (
            <>
              <button type="button" onClick={onAcceptAll} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1">
                <CheckIcon className="h-4 w-4" />
                Accept all
              </button>
              <button
                type="button"
                onClick={() => {
                  setReviewMode(true);
                  setReviewIndex(0);
                  setExpanded(true);
                }}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                Review section by section
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={expanded ? 'Collapse suggestions' : 'Expand suggestions'}
          >
            {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Dismiss suggestions"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && !loading && result && !reviewMode && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {sections.map((key) => (
            <div
              key={key}
              className="rounded-xl border border-violet-100 dark:border-violet-900/50 bg-white/70 dark:bg-slate-900/50 p-3"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                  {SECTION_LABELS[key]}
                </span>
                <button
                  type="button"
                  onClick={() => onAcceptSection(key)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800/50"
                >
                  Accept
                </button>
              </div>
              {renderSectionPreview(key)}
            </div>
          ))}
        </div>
      )}

      {reviewMode && result && (
        <div className="mt-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-white/80 dark:bg-slate-900/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
              Section {reviewIndex + 1} of {sections.length}: {SECTION_LABELS[currentSection]}
            </p>
            <button type="button" onClick={() => setReviewMode(false)} className="text-xs text-slate-500 hover:text-slate-700">
              Exit review
            </button>
          </div>
          {renderSectionPreview(currentSection)}
          <div className="flex flex-wrap gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                onAcceptSection(currentSection);
                if (reviewIndex < sections.length - 1) {
                  setReviewIndex((i) => i + 1);
                } else {
                  setReviewMode(false);
                }
              }}
              className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1"
            >
              <CheckIcon className="h-4 w-4" />
              Accept &amp; continue
            </button>
            <button
              type="button"
              onClick={() => {
                if (reviewIndex < sections.length - 1) {
                  setReviewIndex((i) => i + 1);
                } else {
                  setReviewMode(false);
                }
              }}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}