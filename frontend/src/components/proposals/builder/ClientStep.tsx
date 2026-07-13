import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  MagnifyingGlassIcon,
  UsersIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { AI_COPILOT } from '../../../config/aiCopilot';
import { useProposalBuilder } from './ProposalBuilderContext';

// Render Step 1: Client Selection
export default function ClientStep() {
  const {
    isEditMode,
    selectedClient,
    hasResumedDraft,
    selectedServices,
    coverLetter,
    setCurrentStep,
    restartProposal,
    clientSearch,
    setClientSearch,
    clients,
    selectClient,
    buildMode,
    proposalTemplates,
    aiConfigured,
    selectBuildMode,
    templatesLoading,
    applyingTemplateId,
    applyProposalTemplate,
    selectedTemplateId,
  } = useProposalBuilder();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Select a Client</h2>

      {!isEditMode && selectedClient && hasResumedDraft && (
        <div
          data-testid="draft-resume-banner"
          className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-sm text-amber-900 dark:text-amber-100">
            You have a draft in progress for <strong>{selectedClient.name}</strong>. Continue where
            you left off, go back to change the build approach, or restart from scratch.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={() => {
                if (selectedServices.length > 0 && coverLetter.trim()) setCurrentStep(3);
                else if (selectedServices.length > 0) setCurrentStep(2);
                else setCurrentStep(1);
              }}
            >
              Continue draft
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => restartProposal(true)}
            >
              Restart
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          placeholder="Search clients..."
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <MagnifyingGlassIcon className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
      </div>

      {(() => {
        const filteredClients = clients.filter((c) =>
          c.name.toLowerCase().includes(clientSearch.toLowerCase())
        );
        if (filteredClients.length === 0) {
          return clients.length === 0 ? (
            <div className="card p-10 text-center max-w-md mx-auto">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-700/60">
                <UsersIcon className="h-7 w-7 text-ink-500 dark:text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-ink-900 dark:text-white mb-2">
                No clients yet
              </h3>
              <p className="text-sm text-ink-500 dark:text-slate-400 mb-6 leading-relaxed">
                Add your first client to build a proposal for them.
              </p>
              <Link to="/clients/new" className="btn-primary inline-flex items-center gap-2">
                <UserPlusIcon className="h-5 w-5" />
                Add a client
              </Link>
            </div>
          ) : (
            <div className="card p-10 text-center max-w-md mx-auto">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-700/60">
                <MagnifyingGlassIcon className="h-7 w-7 text-ink-500 dark:text-slate-300" />
              </div>
              <h3 className="text-lg font-semibold text-ink-900 dark:text-white mb-2">
                No clients match “{clientSearch}”
              </h3>
              <p className="text-sm text-ink-500 dark:text-slate-400 leading-relaxed">
                Try a different name, or{' '}
                <Link to="/clients/new" className="text-primary-600 hover:underline">
                  add a new client
                </Link>
                .
              </p>
            </div>
          );
        }
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((client) => (
              <div
                key={client.id}
                data-testid="client-card"
                data-client-name={client.name}
                onClick={() => selectClient(client)}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedClient?.id === client.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <h3 className="font-semibold text-slate-900 dark:text-white">{client.name}</h3>
                {client.contactName?.trim() && (
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {client.contactName.trim()}
                  </p>
                )}
                <p className="text-sm text-slate-500 dark:text-slate-300 dark:text-slate-300">
                  {client.companyType}
                </p>
                <p className="text-sm text-slate-400 dark:text-slate-500 dark:text-slate-300">
                  {client.contactEmail}
                </p>
              </div>
            ))}
          </div>
        );
      })()}

      {selectedClient && buildMode === 'unset' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            How would you like to build this proposal?
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            You can always add or remove services yourself — Clara suggestions are optional.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              data-testid="build-mode-manual"
              onClick={() => selectBuildMode('manual')}
              className="text-left p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-primary-400 dark:hover:border-primary-600 transition-colors"
            >
              <p className="font-semibold text-slate-900 dark:text-white">Build from scratch</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Pick services from your catalogue, set prices, and shape the proposal yourself.
              </p>
            </button>
            {proposalTemplates.length > 0 && (
              <button
                type="button"
                data-testid="build-mode-template"
                onClick={() => selectBuildMode('template')}
                className="text-left p-4 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20 transition-colors"
              >
                <p className="font-semibold text-slate-900 dark:text-white">Use a saved template</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Start from a named bundle you saved before — adjust anything before sending.
                </p>
              </button>
            )}
            {aiConfigured && (
              <button
                type="button"
                data-testid="build-mode-clara"
                onClick={() => selectBuildMode('clara')}
                className="text-left p-4 rounded-xl border-2 border-primary-200 dark:border-primary-800 hover:border-primary-400 dark:hover:border-primary-600 bg-primary-50/50 dark:bg-primary-950/20 transition-colors"
              >
                <p className="font-semibold text-slate-900 dark:text-white">
                  Start with {AI_COPILOT.name} suggestions
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Optional starter bundle — accept, tweak, add, or remove anything before sending.
                </p>
              </button>
            )}
          </div>
          {!aiConfigured && (
            <button
              type="button"
              onClick={() => selectBuildMode('manual')}
              className="btn-primary text-sm"
            >
              Continue manually
            </button>
          )}
        </div>
      )}

      {selectedClient && buildMode === 'template' && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            Choose a template
          </h4>
          {templatesLoading ? (
            <p className="text-xs text-slate-500">Loading templates…</p>
          ) : proposalTemplates.length === 0 ? (
            <p className="text-xs text-slate-500">
              No saved templates yet —{' '}
              <Link
                to="/templates"
                className="text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                create one in Templates
              </Link>{' '}
              or build from scratch and {AI_COPILOT.name} will offer to save when you finish.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {proposalTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  data-testid="proposal-template-option"
                  disabled={applyingTemplateId === tpl.id}
                  onClick={() => void applyProposalTemplate(tpl.id)}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${
                    selectedTemplateId === tpl.id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                  }`}
                >
                  <p className="font-medium text-slate-900 dark:text-white text-sm">{tpl.name}</p>
                  {tpl.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                      {tpl.description}
                    </p>
                  )}
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                    {tpl.serviceCount} service{tpl.serviceCount === 1 ? '' : 's'}
                    {applyingTemplateId === tpl.id ? ' — applying…' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedClient && buildMode !== 'unset' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {buildMode === 'manual'
              ? 'Manual build — add services from your catalogue on the next step.'
              : buildMode === 'template'
                ? selectedTemplateId
                  ? 'Template applied — tweak services and pricing on the next step.'
                  : 'Pick a template above, or change approach.'
                : `${AI_COPILOT.name} may suggest a starter — you stay in control of every line item.`}
            <button
              type="button"
              className="ml-2 text-primary-600 hover:underline"
              onClick={() => selectBuildMode('unset')}
            >
              Change
            </button>
          </p>
          <button
            data-testid="client-continue-button"
            onClick={() => setCurrentStep(2)}
            disabled={buildMode === 'template' && !selectedTemplateId}
            className="btn-primary disabled:opacity-50"
          >
            Continue
            <ArrowRightIcon className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}
    </div>
  );
}
