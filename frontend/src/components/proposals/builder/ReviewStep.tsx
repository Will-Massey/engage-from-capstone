import { toast } from 'react-hot-toast';
import { ArrowLeftIcon, ArrowRightIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { COVER_LETTER_STYLES } from '../../../data/defaultCoverLetter';
import { AiDraftPreview } from '../../ai/AiPanel';
import ProposalHealthCard from '../../ai/ProposalHealthCard';
import { AI_COPILOT } from '../../../config/aiCopilot';
import { DEFAULT_PRICING_TIERS, formatTierMultiplier } from '../../../utils/proposalCustomFields';
import { InvestmentSummaryBands } from './InvestmentSummaryBands';
import { coverLetterAddressee, formatCurrency } from './shared';
import { useProposalBuilder } from './ProposalBuilderContext';

// Render Step 3: Review
export default function ReviewStep() {
  const {
    contractStartDate,
    setContractStartDate,
    validUntil,
    setValidUntil,
    todayIso,
    defaultExpiryDays,
    proposalTitle,
    setProposalTitle,
    selectedClient,
    selectedServices,
    renderSelectedServiceRow,
    summary,
    reviewMonthlyCostIncVat,
    runAiCoverLetter,
    aiCoverLoading,
    aiConfigured,
    aiCoverDraft,
    setAiCoverDraft,
    coverLetter,
    setCoverLetter,
    coverLetterLoading,
    coverLetterTone,
    applyCoverLetterStyle,
    applyCoverLetterTweak,
    applyingCoverLetterTweak,
    coverLetterCustomInstruction,
    setCoverLetterCustomInstruction,
    offerThreePackages,
    setOfferThreePackages,
    pricingTiers,
    setPricingTiers,
    requireTwoSigners,
    setRequireTwoSigners,
    termsLoading,
    proposalTerms,
    validationErrors,
    isEditMode,
    proposalId,
    showLivePreviewPane,
    toggleLivePreviewPane,
    tenant,
    setCurrentStep,
    setShowEmailPreview,
    previewPdf,
    saveProposal,
    isLoading,
  } = useProposalBuilder();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Review & Send</h2>

      {/* Contract start & proposal validity */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Contract & validity</h3>
        <p className="text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300 mb-4">
          Set when the engagement begins and how long this proposal stays open. Annual renewals are
          calculated from the contract start date (or acceptance if left blank).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Contract start date
            </label>
            <input
              data-testid="contract-start-date"
              type="date"
              value={contractStartDate}
              onChange={(e) => setContractStartDate(e.target.value)}
              className="input-field w-full"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              Optional — use for future-dated engagements
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Proposal valid until
            </label>
            <input
              data-testid="proposal-valid-until"
              type="date"
              value={validUntil}
              min={todayIso}
              onChange={(e) => setValidUntil(e.target.value)}
              className="input-field w-full"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              Practice default: {defaultExpiryDays} days (change in Settings → Communications)
            </p>
          </div>
        </div>
      </div>

      {/* Proposal Title */}
      <div className="card p-4 border-2 border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
          Proposal Title *
        </label>
        <input
          data-testid="proposal-title-input"
          type="text"
          value={proposalTitle}
          onChange={(e) => setProposalTitle(e.target.value)}
          placeholder="e.g., Accounting Services 2026"
          className="input-field w-full text-lg font-medium"
        />
      </div>

      {/* Client Summary */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Client</h3>
        <p className="text-slate-700 dark:text-slate-200">{selectedClient?.name}</p>
        {selectedClient?.contactName?.trim() && (
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {selectedClient.contactName.trim()}
          </p>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-300 dark:text-slate-300">
          {selectedClient?.contactEmail}
        </p>
      </div>

      {/* Services — editable rows, grouped for clarity */}
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Services</h3>
        <p className="text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300 mb-4">
          Choose each service&apos;s billing period below — prices adjust automatically when you
          change cadence. Use edit for price, quantity, VAT, or one-off due dates.
        </p>

        <div className="space-y-2">{selectedServices.map(renderSelectedServiceRow)}</div>

        <div className="mt-6 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 space-y-3">
          <InvestmentSummaryBands summary={summary} />
          {(summary.monthly.count > 0 ||
            summary.annually.count > 0 ||
            summary.quarterly.count > 0 ||
            summary.weekly.count > 0) && (
            <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-slate-600">
              <div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  Typical monthly cash flow
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300 mt-0.5 max-w-md">
                  Recurring fees averaged per month (inc. VAT). One-time project fees are listed
                  separately above.
                </p>
              </div>
              <span className="text-xl font-bold text-primary-600 tabular-nums">
                {formatCurrency(reviewMonthlyCostIncVat)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Client proposal letter — verbose sales prose */}
      <div className="card p-4 border border-primary-100 dark:border-primary-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Proposal letter for your client
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
              Persuasive, personal sales prose — introduces each service and its benefits before the
              fee schedule. This is your key differentiator; edit freely after Clara drafts it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runAiCoverLetter}
              disabled={aiCoverLoading || !aiConfigured}
              className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/30 disabled:opacity-50"
              title={aiConfigured ? AI_COPILOT.draftWithLabel : `${AI_COPILOT.name} unavailable`}
            >
              <SparklesIcon className={`h-3.5 w-3.5 ${aiCoverLoading ? 'animate-pulse' : ''}`} />
              {aiCoverLoading ? 'Drafting…' : AI_COPILOT.draftWithLabel}
            </button>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
              Tone affects only this letter
            </span>
          </div>
        </div>

        {aiCoverDraft && (
          <AiDraftPreview
            content={aiCoverDraft}
            onApply={() => {
              setCoverLetter(aiCoverDraft);
              setAiCoverDraft(null);
              toast.success(`${AI_COPILOT.name}'s letter applied — review before sending`);
            }}
            onDiscard={() => setAiCoverDraft(null)}
            onEdit={() => {
              if (aiCoverDraft) {
                setCoverLetter(aiCoverDraft);
                setAiCoverDraft(null);
                toast('Draft moved to editor — make your changes there');
              }
            }}
            onRegenerate={runAiCoverLetter}
            isStreaming={aiCoverLoading}
            applyLabel="Accept letter"
          />
        )}

        {/* Style picker — beautiful, instantly autofills names/services */}
        <div className="mb-3">
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300 dark:text-slate-300 mb-1.5">
            Choose tone (autofills client name, company, services, date)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {COVER_LETTER_STYLES.map((style) => {
              const active = coverLetterTone === style.tone;
              return (
                <button
                  key={style.tone}
                  type="button"
                  onClick={() => applyCoverLetterStyle(style.tone)}
                  className={`group text-left rounded-2xl border p-3 transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40
                    ${
                      active
                        ? 'border-primary-400 bg-primary-50/70 dark:bg-primary-950/30 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`text-sm font-semibold ${active ? 'text-primary-700 dark:text-primary-300' : 'text-slate-800 dark:text-slate-100'}`}
                    >
                      {style.name}
                    </div>
                    {active && (
                      <span className="text-[10px] px-1.5 py-px rounded bg-primary-200 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300 leading-snug">
                    {style.description}
                  </div>
                  <div className="mt-2 text-[10px] text-slate-400 group-hover:text-slate-500 dark:text-slate-300 transition-colors">
                    {style.preview}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300 mb-2">
          Personalised for {selectedClient ? coverLetterAddressee(selectedClient) : 'your client'}.
          You can edit the text freely after choosing a tone.
        </p>

        {coverLetterLoading && !coverLetter.trim() && (
          <div
            className="py-8 text-center text-sm text-slate-500 dark:text-slate-400"
            aria-busy="true"
          >
            <SparklesIcon className="h-6 w-6 text-primary-500 mx-auto animate-pulse mb-2" />
            {AI_COPILOT.name} is writing your client proposal letter…
          </div>
        )}

        <textarea
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          rows={20}
          className="input-field w-full text-sm font-sans leading-relaxed min-h-[380px]"
          placeholder={
            aiConfigured
              ? 'Clara will draft a persuasive letter when you reach this step — or click Draft with Clara…'
              : 'Write a persuasive proposal letter for your client…'
          }
          aria-label="Proposal letter for client"
          disabled={coverLetterLoading && !coverLetter.trim()}
        />

        {/* Cheap Clara tweaks for cover letter - max impact, min tokens (edits existing text) */}
        {coverLetter.trim() && aiConfigured && (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-1.5">
              <SparklesIcon className="h-3.5 w-3.5 text-primary-600" />
              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-300 dark:text-slate-300">
                Clara quick tweaks (low cost)
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {['Make warmer', 'Shorter & punchier', 'More formal', 'Add urgency on deadline'].map(
                (label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => applyCoverLetterTweak(label)}
                    disabled={applyingCoverLetterTweak}
                    className="text-xs px-2 py-0.5 rounded border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-950/30 disabled:opacity-50"
                  >
                    {label}
                  </button>
                )
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={coverLetterCustomInstruction}
                onChange={(e) => setCoverLetterCustomInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && coverLetterCustomInstruction.trim()) {
                    applyCoverLetterTweak(coverLetterCustomInstruction.trim());
                    setCoverLetterCustomInstruction('');
                  }
                }}
                placeholder="Or tell Clara what to change..."
                className="input-field flex-1 text-xs py-1"
                disabled={applyingCoverLetterTweak}
              />
              <button
                type="button"
                onClick={() => {
                  if (coverLetterCustomInstruction.trim()) {
                    applyCoverLetterTweak(coverLetterCustomInstruction.trim());
                    setCoverLetterCustomInstruction('');
                  }
                }}
                disabled={applyingCoverLetterTweak || !coverLetterCustomInstruction.trim()}
                className="btn-secondary text-xs px-2 py-1 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Package options — Bronze / Silver / Gold / Platinum */}
      <div
        className="card p-4 border border-primary-100 dark:border-primary-900/40"
        data-testid="package-options-card"
      >
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Package options</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Offer your client a choice of Bronze, Silver, Gold, or Platinum packages on the sign page.
          Fees scale from your base proposal total.
        </p>

        <label className="flex items-start gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            data-testid="offer-three-packages-toggle"
            checked={offerThreePackages}
            onChange={(e) => {
              setOfferThreePackages(e.target.checked);
              if (e.target.checked && pricingTiers.length < 4) {
                setPricingTiers(DEFAULT_PRICING_TIERS);
              }
            }}
            className="mt-1 h-4 w-4 rounded text-primary-600"
          />
          <span className="text-sm text-slate-800 dark:text-slate-100">
            Offer package tiers (Bronze / Silver / Gold / Platinum)
          </span>
        </label>

        {offerThreePackages && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
            {pricingTiers.map((tier, index) => (
              <div
                key={tier.id}
                className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 space-y-2 bg-slate-50/50 dark:bg-slate-800/40"
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Tier {index + 1} · {formatTierMultiplier(tier)}
                </p>
                <input
                  type="text"
                  value={tier.label}
                  onChange={(e) => {
                    const next = [...pricingTiers];
                    next[index] = { ...tier, label: e.target.value };
                    setPricingTiers(next);
                  }}
                  className="input-field w-full text-sm font-medium"
                  placeholder="Package name"
                />
                <textarea
                  value={tier.description || ''}
                  onChange={(e) => {
                    const next = [...pricingTiers];
                    next[index] = { ...tier, description: e.target.value };
                    setPricingTiers(next);
                  }}
                  rows={2}
                  className="input-field w-full text-xs"
                  placeholder="Short description for the client"
                />
              </div>
            ))}
          </div>
        )}

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            data-testid="require-two-signers-toggle"
            checked={requireTwoSigners}
            onChange={(e) => setRequireTwoSigners(e.target.checked)}
            className="mt-1 h-4 w-4 rounded text-primary-600"
          />
          <span className="text-sm text-slate-800 dark:text-slate-100">
            Require an additional signatory (e.g. second director — max 2 signers)
          </span>
        </label>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
          Terms &amp; conditions
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Included in the proposal PDF and client view. Clara can answer questions about these
          terms.
        </p>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 max-h-48 overflow-y-auto text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-sans proposal-watermark-panel">
          {termsLoading ? (
            <p className="text-slate-500 italic">Preparing terms…</p>
          ) : proposalTerms.trim() ? (
            proposalTerms
          ) : (
            <p className="text-slate-500 italic">
              Add services to generate terms from your engagement library.
            </p>
          )}
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-800 p-4">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Before you send</p>
          <ul className="mt-2 text-sm text-amber-800 dark:text-amber-300 list-disc pl-5 space-y-1">
            {validationErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {isEditMode && proposalId && aiConfigured && <ProposalHealthCard proposalId={proposalId} />}

      {!isEditMode && aiConfigured && (
        <div className="glass-tile p-4 border border-primary-200 dark:border-primary-800/50">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            <SparklesIcon className="inline h-4 w-4 text-primary-500 mr-1" />
            {AI_COPILOT.name} tip: After creating the proposal, open it to get a health score and
            follow-up suggestions.
          </p>
        </div>
      )}

      {showLivePreviewPane && (
        <div className="card p-5 border-2 border-slate-200 dark:border-slate-600">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">Client preview</h3>
            <button
              type="button"
              onClick={() => toggleLivePreviewPane(false)}
              className="text-sm text-slate-500 dark:text-slate-300 hover:text-slate-700"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-300 mb-2">From {tenant?.name}</p>
          <h4 className="text-lg font-bold">{proposalTitle || 'Proposal title'}</h4>
          <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">
            {coverLetter.slice(0, 600)}
            {coverLetter.length > 600 ? '…' : ''}
          </p>
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
            <InvestmentSummaryBands summary={summary} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap justify-between gap-3">
        <button
          data-testid="review-back-button"
          onClick={() => setCurrentStep(2)}
          className="btn-secondary"
        >
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => toggleLivePreviewPane()}
            className="btn-secondary text-sm lg:hidden"
          >
            {showLivePreviewPane ? 'Hide preview' : 'Preview for client'}
          </button>
          {aiConfigured && selectedClient && (
            <button
              type="button"
              onClick={() => setShowEmailPreview(true)}
              className="btn-secondary text-sm inline-flex items-center gap-1.5 border-primary-200 dark:border-primary-700 text-primary-700 dark:text-primary-300"
            >
              <SparklesIcon className="h-4 w-4" />
              Preview client email
            </button>
          )}
          {isEditMode ? (
            <button type="button" onClick={previewPdf} className="btn-secondary text-sm">
              Download PDF
            </button>
          ) : (
            <button type="button" onClick={previewPdf} className="btn-secondary text-sm">
              Client preview
            </button>
          )}
          <button
            data-testid="create-proposal-button"
            onClick={saveProposal}
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Proposal'}
            <ArrowRightIcon className="w-5 h-5 ml-2" />
          </button>
        </div>
      </div>
    </div>
  );
}
