import { useState } from 'react';
import { XMarkIcon, SparklesIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import { AI_COPILOT } from '../../config/aiCopilot';

interface SaveProposalTemplateDialogProps {
  open: boolean;
  proposalId: string;
  proposalTitle?: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function SaveProposalTemplateDialog({
  open,
  proposalId,
  proposalTitle,
  onClose,
  onSaved,
}: SaveProposalTemplateDialogProps) {
  const [name, setName] = useState(proposalTitle ? `${proposalTitle} template` : '');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Please enter a template name');
      return;
    }
    setSaving(true);
    try {
      const res = (await apiClient.saveProposalTemplateFromProposal(
        proposalId,
        trimmed,
        description.trim() || undefined
      )) as any;
      if (res.success) {
        toast.success(`Template "${trimmed}" saved`);
        onSaved?.();
        onClose();
      } else {
        toast.error(res.error?.message || 'Failed to save template');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        role="dialog"
        aria-labelledby="save-template-title"
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-violet-200 dark:border-violet-800"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40">
              <SparklesIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0">
              <h2 id="save-template-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                Save as template?
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {AI_COPILOT.name} can reuse this service bundle and cover letter next time you start a
                proposal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="template-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Template name
            </label>
            <input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard limited company package"
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800 text-slate-900 dark:text-white"
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="template-description"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When to use this template…"
              rows={2}
              maxLength={500}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
          <button type="button" onClick={onClose} className="btn-secondary text-sm" disabled={saving}>
            Not now
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="btn-primary text-sm inline-flex items-center gap-2"
          >
            <DocumentDuplicateIcon className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </div>
    </div>
  );
}