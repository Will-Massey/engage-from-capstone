import { useEffect, useState } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';

const COMMON_ITEMS = [
  'Bank statements',
  'Sales invoices',
  'Purchase invoices / receipts',
  'Payroll summaries',
  'VAT records',
  'Photo ID',
  'Proof of address',
  'Previous year accounts',
  'Mortgage / loan statements',
  'Dividend vouchers',
];

interface ItemDraft {
  name: string;
  required: boolean;
}

interface DocumentRequestDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  jobId?: string | null;
  onCreated?: () => void;
}

export default function DocumentRequestDialog({
  open,
  onClose,
  clientId,
  clientName,
  jobId,
  onCreated,
}: DocumentRequestDialogProps) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([{ name: 'Bank statements', required: true }]);
  const [customItem, setCustomItem] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setMessage('');
      setItems([{ name: 'Bank statements', required: true }]);
      setCustomItem('');
    }
  }, [open]);

  if (!open) return null;

  const addItem = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())) return;
    setItems((prev) => [...prev, { name: trimmed, required: true }]);
  };

  const submit = async (send: boolean) => {
    if (!title.trim()) {
      toast.error('Give the request a title, e.g. “2025 year-end records”.');
      return;
    }
    if (!items.length) {
      toast.error('Add at least one document.');
      return;
    }
    setSending(true);
    try {
      const res = (await apiClient.post('/document-requests', {
        clientId,
        jobId: jobId || null,
        title: title.trim(),
        message: message.trim() || null,
        items,
        send,
      })) as { success?: boolean; data?: { emailSent?: boolean; emailError?: string } };
      if (res?.success) {
        if (send && res.data?.emailSent) {
          toast.success(`Request emailed to ${clientName}.`);
        } else if (send && !res.data?.emailSent) {
          toast.error(
            `Request saved but the email failed${res.data?.emailError ? `: ${res.data.emailError}` : ''}. Use Resend once fixed.`
          );
        } else {
          toast.success('Request saved as draft — resend when ready.');
        }
        onCreated?.();
        onClose();
      }
    } catch (e: any) {
      toast.error(e?.message || 'Could not create the request');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Request documents
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {clientName} receives an email with a secure portal link and this checklist.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2025 year-end records"
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Documents needed
            </label>
            <div className="space-y-1.5">
              {items.map((item, idx) => (
                <div
                  key={item.name}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"
                >
                  <span className="flex-1 text-sm text-slate-800 dark:text-slate-200">
                    {item.name}
                  </span>
                  <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, required: e.target.checked } : p))
                        )
                      }
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                    aria-label={`Remove ${item.name}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {COMMON_ITEMS.filter(
                (c) => !items.some((i) => i.name.toLowerCase() === c.toLowerCase())
              ).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => addItem(c)}
                  className="text-[11px] px-2 py-1 rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 cursor-pointer"
                >
                  + {c}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(customItem);
                    setCustomItem('');
                  }
                }}
                placeholder="Add another document…"
                className="input-field flex-1 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  addItem(customItem);
                  setCustomItem('');
                }}
                className="btn-secondary px-3 cursor-pointer"
                aria-label="Add document"
              >
                <PlusIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Message to the client (optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Anything that helps them find the right documents…"
              className="input-field w-full text-sm"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={sending}
            className="btn-secondary cursor-pointer"
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={sending}
            className="btn-primary flex items-center gap-2 cursor-pointer"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
    </div>
  );
}
