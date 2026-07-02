import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import { ArrowPathIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

export type ProposalTermsConfig = {
  defaultPaymentTermsDays: number;
  cancellationNoticeDays: number;
  termsSource: 'engage_default' | 'custom';
  customTerms: string | null;
};

interface ProposalTermsSettingsProps {
  proposals: ProposalTermsConfig;
  onChange: (patch: Partial<ProposalTermsConfig>) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
}

export default function ProposalTermsSettings({
  proposals,
  onChange,
  onSave,
  isSaving,
}: ProposalTermsSettingsProps) {
  const [defaultTemplate, setDefaultTemplate] = useState('');
  const [defaultPreview, setDefaultPreview] = useState('');
  const [loadingDefaults, setLoadingDefaults] = useState(true);

  const loadDefaults = useCallback(async () => {
    setLoadingDefaults(true);
    try {
      const res = (await apiClient.getDefaultProposalTerms()) as {
        success?: boolean;
        data?: { template?: string; preview?: string };
      };
      if (res.success && res.data) {
        setDefaultTemplate(res.data.template || '');
        setDefaultPreview(res.data.preview || '');
      }
    } catch {
      toast.error('Failed to load default terms template');
    } finally {
      setLoadingDefaults(false);
    }
  }, []);

  useEffect(() => {
    loadDefaults();
  }, [loadDefaults]);

  const handleRevertToDefault = () => {
    if (!defaultTemplate) {
      toast.error('Default template not loaded yet — try again in a moment');
      return;
    }
    onChange({
      termsSource: 'engage_default',
      customTerms: null,
    });
    toast.success('Reverted to Engage default terms');
  };

  const handleUseCustom = () => {
    const seed =
      proposals.customTerms?.trim() ||
      defaultTemplate ||
      '';
    onChange({
      termsSource: 'custom',
      customTerms: seed,
    });
  };

  const isCustom = proposals.termsSource === 'custom';

  return (
    <div className="glass-tile overflow-hidden">
      <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
        <div className="flex items-center gap-2">
          <DocumentTextIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Proposal terms &amp; conditions
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-300 mt-1">
          Attached to every proposal PDF and client view. Clara uses these when answering client
          questions.
        </p>
      </div>

      <div className="p-6 space-y-5">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="termsSource"
              checked={!isCustom}
              onChange={() =>
                onChange({ termsSource: 'engage_default', customTerms: proposals.customTerms })
              }
              className="text-primary-600 focus:ring-primary-200"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-100">
              Use Engage default terms
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="termsSource"
              checked={isCustom}
              onChange={handleUseCustom}
              className="text-primary-600 focus:ring-primary-200"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-100">
              Use my own terms
            </span>
          </label>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Optional placeholders:{' '}
          <code className="text-xs">{'{{PRACTICE_NAME}}'}</code>,{' '}
          <code className="text-xs">{'{{PAYMENT_TERMS}}'}</code>,{' '}
          <code className="text-xs">{'{{CANCELLATION_NOTICE}}'}</code>,{' '}
          <code className="text-xs">{'{{GOVERNING_LAW}}'}</code> — filled from your practice
          settings when proposals are sent.
        </p>

        {isCustom ? (
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100 mb-1">
              Your terms template
            </label>
            <textarea
              rows={18}
              value={proposals.customTerms || ''}
              onChange={(e) =>
                onChange({ termsSource: 'custom', customTerms: e.target.value })
              }
              className="input-field w-full font-mono text-sm leading-relaxed"
              placeholder="Enter your terms and conditions…"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100 mb-1">
              Preview (Engage default)
            </label>
            <pre className="proposal-watermark-panel whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200 p-4 rounded-lg border border-slate-200 dark:border-slate-700 max-h-96 overflow-y-auto font-sans">
              {loadingDefaults ? 'Loading…' : defaultPreview || 'No preview available.'}
            </pre>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={handleRevertToDefault}
            disabled={loadingDefaults || (!isCustom && !proposals.customTerms)}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Revert to Engage default
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={isSaving}
            className="btn-primary"
          >
            {isSaving ? 'Saving…' : 'Save terms'}
          </button>
        </div>
      </div>
    </div>
  );
}