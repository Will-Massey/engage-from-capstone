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
  const [engageDefaultText, setEngageDefaultText] = useState('');
  const [editorText, setEditorText] = useState('');
  const [loadingDefaults, setLoadingDefaults] = useState(true);

  const loadDefaults = useCallback(async () => {
    setLoadingDefaults(true);
    try {
      const res = (await apiClient.getDefaultProposalTerms()) as {
        success?: boolean;
        data?: { preview?: string; template?: string };
      };
      if (res.success && res.data) {
        const preview = res.data.preview || res.data.template || '';
        setEngageDefaultText(preview);
      }
    } catch {
      toast.error('Failed to load default terms');
    } finally {
      setLoadingDefaults(false);
    }
  }, []);

  useEffect(() => {
    void loadDefaults();
  }, [loadDefaults]);

  // Sync editor when settings load from server
  useEffect(() => {
    if (loadingDefaults) return;
    if (proposals.termsSource === 'custom' && proposals.customTerms?.trim()) {
      setEditorText(proposals.customTerms);
      return;
    }
    setEditorText(engageDefaultText);
  }, [proposals.termsSource, proposals.customTerms, engageDefaultText, loadingDefaults]);

  const handleEditorChange = (value: string) => {
    setEditorText(value);
    const usingDefault =
      engageDefaultText.trim() !== '' && value.trim() === engageDefaultText.trim();
    onChange({
      termsSource: usingDefault ? 'engage_default' : 'custom',
      customTerms: usingDefault ? null : value,
    });
  };

  const handleRevertToDefault = () => {
    if (!engageDefaultText) {
      toast.error('Default terms not loaded yet — try again in a moment');
      return;
    }
    setEditorText(engageDefaultText);
    onChange({ termsSource: 'engage_default', customTerms: null });
    toast.success('Restored Engage default terms');
  };

  const isUsingCustom =
    proposals.termsSource === 'custom' ||
    (engageDefaultText.trim() !== '' && editorText.trim() !== engageDefaultText.trim());

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
          Paste your firm&apos;s terms below to replace the Engage defaults on every proposal. Use
          &quot;Restore Engage defaults&quot; to switch back at any time.
        </p>
      </div>

      <div className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100 mb-1">
            Your terms &amp; conditions
          </label>
          <textarea
            rows={20}
            value={loadingDefaults ? 'Loading…' : editorText}
            onChange={(e) => handleEditorChange(e.target.value)}
            disabled={loadingDefaults}
            className="input-field w-full text-sm leading-relaxed min-h-[320px]"
            placeholder="Paste your firm's terms and conditions here…"
          />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Optional placeholders: <code className="text-xs">{'{{PRACTICE_NAME}}'}</code>,{' '}
            <code className="text-xs">{'{{PAYMENT_TERMS}}'}</code>,{' '}
            <code className="text-xs">{'{{CANCELLATION_NOTICE}}'}</code>,{' '}
            <code className="text-xs">{'{{GOVERNING_LAW}}'}</code>
          </p>
        </div>

        {isUsingCustom && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            You are using your own terms. Proposals will use this text instead of the Engage default
            set.
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={handleRevertToDefault}
            disabled={loadingDefaults || !isUsingCustom}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Restore Engage defaults
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={isSaving || loadingDefaults}
            className="btn-primary"
          >
            {isSaving ? 'Saving…' : 'Save terms'}
          </button>
        </div>
      </div>
    </div>
  );
}
