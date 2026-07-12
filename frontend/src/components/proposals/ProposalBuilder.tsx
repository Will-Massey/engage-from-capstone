/**
 * Proposal Builder — compact, editable service selection and pricing.
 *
 * Key features:
 * 1. Compact service selection — more services visible at once
 * 2. Inline editing of price, quantity, discount, and VAT
 * 3. Clear pricing display with edit capability (billing cycles)
 */

import { CheckIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import ProposalClientPreview from './ProposalClientPreview';
import RegulatoryCheckBanner from './RegulatoryCheckBanner';
import ProposalBuilderClara from '../ai/ProposalBuilderClara';
import ClientContextCard from '../ai/ClientContextCard';
import AutoFitBanner from '../ai/AutoFitBanner';
import ProposalEmailPreviewDialog from '../ai/ProposalEmailPreviewDialog';
import SaveProposalTemplateDialog from './SaveProposalTemplateDialog';
import { AI_COPILOT } from '../../config/aiCopilot';
import { coverLetterAddressee } from './builder/shared';
import { ProposalBuilderProvider, useProposalBuilder } from './builder/ProposalBuilderContext';
import ClientStep from './builder/ClientStep';
import ServicesStep from './builder/ServicesStep';
import ReviewStep from './builder/ReviewStep';

const STEPS = [
  { id: 1, name: 'Select Client', description: 'Choose who this proposal is for' },
  { id: 2, name: 'Add Services', description: 'Select and customise services' },
  { id: 3, name: 'Review & Send', description: 'Review and send proposal' },
];

interface ProposalBuilderProps {
  proposalId?: string;
}

function ProposalBuilderShell() {
  const {
    navigate,
    tenant,
    user,
    isEditMode,
    currentStep,
    setCurrentStep,
    selectedClient,
    restartProposal,
    showLivePreviewPane,
    toggleLivePreviewPane,
    buildMode,
    aiConfigured,
    autoFitDismissed,
    setAutoFitDismissed,
    autoFitLoading,
    autoFitResult,
    setAutoFitResult,
    runAutoFitForClient,
    applyAllAutoFit,
    applyAutoFitSection,
    applyAutoFitService,
    applyTweakedAutoFitService,
    claraServiceLines,
    showPreviewPane,
    sideBySidePreview,
    proposalTitle,
    setProposalTitle,
    coverLetter,
    previewServices,
    summary,
    validUntil,
    proposalTerms,
    runAiSuggestServices,
    aiSuggestLoading,
    aiSuggestions,
    applySingleAiSuggestion,
    applyTweakedAiSuggestion,
    runAiCoverLetter,
    aiCoverLoading,
    showEmailPreview,
    setShowEmailPreview,
    emailDraftPayload,
    saveTemplateDialog,
    setSaveTemplateDialog,
    loadProposalTemplates,
  } = useProposalBuilder();

  // Render step indicator
  const renderStepIndicator = () => (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div className="flex items-center justify-center flex-1">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex flex-col items-center ${currentStep >= step.id ? 'cursor-pointer' : ''}`}
              onClick={() => {
                if (currentStep > step.id) setCurrentStep(step.id);
              }}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                  currentStep === step.id
                    ? 'bg-primary-600 text-white'
                    : currentStep > step.id
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-200 text-slate-500 dark:text-slate-300'
                }`}
              >
                {currentStep > step.id ? <CheckIcon className="w-5 h-5" /> : step.id}
              </div>
              <span
                className={`text-xs mt-2 ${currentStep === step.id ? 'text-primary-600 font-medium' : 'text-slate-500 dark:text-slate-300'}`}
              >
                {step.name}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`w-16 h-0.5 mx-2 ${currentStep > step.id ? 'bg-green-500' : 'bg-slate-200'}`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {!isEditMode && selectedClient && currentStep > 1 && (
          <>
            <button
              type="button"
              data-testid="back-to-step-one"
              onClick={() => setCurrentStep(1)}
              className="btn-secondary text-sm"
            >
              Back to start
            </button>
            <button
              type="button"
              data-testid="restart-proposal"
              onClick={() => restartProposal(true)}
              className="btn-secondary text-sm text-amber-800 border-amber-200 dark:text-amber-200 dark:border-amber-800"
            >
              Restart proposal
            </button>
          </>
        )}
        {selectedClient && currentStep >= 2 && (
          <button
            type="button"
            data-testid="toggle-client-preview-pane"
            onClick={() => toggleLivePreviewPane()}
            className={`btn-secondary text-sm inline-flex items-center gap-2 ${
              showLivePreviewPane
                ? 'border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
                : ''
            }`}
          >
            {showLivePreviewPane ? (
              <EyeSlashIcon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <EyeIcon className="h-4 w-4" aria-hidden="true" />
            )}
            {showLivePreviewPane ? 'Hide client preview' : 'Show client preview'}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto">
      {renderStepIndicator()}

      {selectedClient &&
        buildMode === 'clara' &&
        !autoFitDismissed &&
        !autoFitLoading &&
        !autoFitResult &&
        aiConfigured && (
          <div className="mb-6 rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-950/20 p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Ask {AI_COPILOT.name} for an optional starter bundle for {selectedClient.name}.
            </p>
            <button
              type="button"
              onClick={() => void runAutoFitForClient(selectedClient.id)}
              className="btn-primary text-sm"
            >
              Get {AI_COPILOT.name} suggestions
            </button>
          </div>
        )}

      {selectedClient &&
        buildMode === 'clara' &&
        !autoFitDismissed &&
        (autoFitLoading || autoFitResult) && (
          <AutoFitBanner
            clientName={selectedClient.name}
            result={autoFitResult}
            loading={autoFitLoading}
            configured={aiConfigured}
            onAcceptAll={applyAllAutoFit}
            onAcceptSection={applyAutoFitSection}
            onDismiss={() => {
              setAutoFitDismissed(true);
              setAutoFitResult(null);
            }}
            onAcceptService={applyAutoFitService}
            onTweakService={applyTweakedAutoFitService}
            onRejectService={() => {}}
          />
        )}

      <div
        className={
          selectedClient && currentStep >= 2
            ? sideBySidePreview
              ? 'grid grid-cols-1 2xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,420px)] gap-6 items-start'
              : showPreviewPane
                ? 'flex flex-col gap-6'
                : 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] gap-6 items-start'
            : ''
        }
      >
        <div
          className={`animate-fade-in space-y-4 ${sideBySidePreview ? 'min-w-0' : 'w-full min-w-[min(100%,42rem)]'}`}
        >
          {selectedClient && currentStep >= 2 && (
            <RegulatoryCheckBanner clientId={selectedClient.id} compact={currentStep === 2} />
          )}
          {selectedClient && currentStep >= 2 && currentStep <= 3 && (
            <ClientContextCard
              clientId={selectedClient.id}
              clientName={selectedClient.name}
              companyType={selectedClient.companyType}
              configured={aiConfigured}
            />
          )}
          {currentStep === 1 && <ClientStep />}
          {currentStep === 2 && <ServicesStep />}
          {currentStep === 3 && <ReviewStep />}
        </div>

        {showPreviewPane && (
          <div
            className={
              sideBySidePreview
                ? 'min-w-0 2xl:sticky 2xl:top-4 order-first 2xl:order-none'
                : 'w-full order-last'
            }
          >
            <ProposalClientPreview
              practiceName={tenant?.name || 'Your practice'}
              practiceLogo={tenant?.logo}
              primaryColor={tenant?.primaryColor}
              clientName={selectedClient.name}
              clientContactName={coverLetterAddressee(selectedClient)}
              preparedByName={
                `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || undefined
              }
              preparedByTitle={user?.jobTitle?.trim() || undefined}
              proposalTitle={proposalTitle}
              coverLetter={coverLetter}
              services={previewServices}
              summary={summary}
              validUntil={validUntil}
              terms={proposalTerms}
              showCoverLetter={currentStep >= 3}
              showTerms={currentStep >= 3}
            />
          </div>
        )}

        {selectedClient && currentStep >= 2 && !showLivePreviewPane && (
          <div className="space-y-4 min-w-0 hidden lg:block lg:sticky lg:top-4">
            <ProposalBuilderClara
              step={currentStep}
              clientId={selectedClient.id}
              clientName={selectedClient.name}
              proposalTitle={proposalTitle}
              coverLetter={coverLetter}
              validUntil={validUntil}
              services={claraServiceLines}
              configured={aiConfigured}
              onApplyTitle={setProposalTitle}
              onSuggestServices={runAiSuggestServices}
              suggestLoading={aiSuggestLoading}
              suggestions={aiSuggestions}
              onApplySingleSuggestion={applySingleAiSuggestion}
              onTweakSingleSuggestion={applyTweakedAiSuggestion}
              onDraftCoverLetter={runAiCoverLetter}
              coverLoading={aiCoverLoading}
              terms={proposalTerms}
            />
          </div>
        )}
      </div>

      <ProposalEmailPreviewDialog
        open={showEmailPreview}
        onClose={() => setShowEmailPreview(false)}
        draft={emailDraftPayload}
        previewOnly
      />

      <SaveProposalTemplateDialog
        open={saveTemplateDialog.open}
        proposalId={saveTemplateDialog.proposalId}
        proposalTitle={proposalTitle}
        onClose={() => {
          const id = saveTemplateDialog.proposalId;
          setSaveTemplateDialog({ open: false, proposalId: '' });
          if (id) navigate(`/proposals/${id}`);
        }}
        onSaved={() => void loadProposalTemplates()}
      />
    </div>
  );
}

export default function ProposalBuilder({ proposalId }: ProposalBuilderProps) {
  return (
    <ProposalBuilderProvider proposalId={proposalId}>
      <ProposalBuilderShell />
    </ProposalBuilderProvider>
  );
}
// TEST COMMENT FOR BUILD
// FORCE REBUILD Sat Apr 11 10:26:46 BST 2026
export const BUILD_TIMESTAMP = 'Sat Apr 11 10:32:40 BST 2026';
