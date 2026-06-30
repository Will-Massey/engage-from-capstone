import { useEffect, useMemo, useState } from 'react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { formatCurrency } from '../../utils/formatters';
import toast from 'react-hot-toast';

export interface TemplateServiceLine {
  serviceId: string;
  name: string;
  billingFrequency: string;
  displayPrice: number;
  quantity: number;
  discountPercent: number;
}

interface CatalogueService {
  id: string;
  name: string;
  description?: string;
  priceAmount?: number;
  basePrice?: number;
  billingCycle?: string;
  defaultFrequency?: string;
}

const FREQUENCY_OPTIONS = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUALLY', label: 'Annually' },
  { value: 'ONE_TIME', label: 'One-time' },
  { value: 'WEEKLY', label: 'Weekly' },
];

export interface ProposalTemplateEditorValues {
  name: string;
  description: string;
  title: string;
  coverLetter: string;
  serviceConfig: TemplateServiceLine[];
}

interface ProposalTemplateEditorProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialValues?: Partial<ProposalTemplateEditorValues>;
  templateId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const emptyForm: ProposalTemplateEditorValues = {
  name: '',
  description: '',
  title: '',
  coverLetter: '',
  serviceConfig: [],
};

export default function ProposalTemplateEditor({
  open,
  mode,
  initialValues,
  templateId,
  onClose,
  onSaved,
}: ProposalTemplateEditorProps) {
  const [form, setForm] = useState<ProposalTemplateEditorValues>(emptyForm);
  const [catalogue, setCatalogue] = useState<CatalogueService[]>([]);
  const [loadingCatalogue, setLoadingCatalogue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm,
      ...initialValues,
      serviceConfig: initialValues?.serviceConfig ? [...initialValues.serviceConfig] : [],
    });
    setServiceSearch('');
  }, [open, initialValues]);

  useEffect(() => {
    if (!open) return;
    setLoadingCatalogue(true);
    apiClient
      .getServices({ limit: 200 })
      .then((res: any) => {
        if (res.success) {
          setCatalogue(
            (res.data || []).map((s: CatalogueService) => ({
              ...s,
              priceAmount: s.priceAmount ?? s.basePrice ?? 0,
              billingCycle: s.billingCycle || s.defaultFrequency || 'MONTHLY',
            }))
          );
        }
      })
      .catch(() => toast.error('Failed to load services catalogue'))
      .finally(() => setLoadingCatalogue(false));
  }, [open]);

  const filteredCatalogue = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter((s) => s.name.toLowerCase().includes(q));
  }, [catalogue, serviceSearch]);

  const addService = (service: CatalogueService) => {
    if (form.serviceConfig.some((l) => l.serviceId === service.id)) {
      toast.success('Service already in template');
      return;
    }
    const price = service.priceAmount ?? service.basePrice ?? 0;
    setForm((prev) => ({
      ...prev,
      serviceConfig: [
        ...prev.serviceConfig,
        {
          serviceId: service.id,
          name: service.name,
          billingFrequency: service.billingCycle || 'MONTHLY',
          displayPrice: price,
          quantity: 1,
          discountPercent: 0,
        },
      ],
    }));
  };

  const updateLine = (serviceId: string, patch: Partial<TemplateServiceLine>) => {
    setForm((prev) => ({
      ...prev,
      serviceConfig: prev.serviceConfig.map((l) =>
        l.serviceId === serviceId ? { ...l, ...patch } : l
      ),
    }));
  };

  const removeLine = (serviceId: string) => {
    setForm((prev) => ({
      ...prev,
      serviceConfig: prev.serviceConfig.filter((l) => l.serviceId !== serviceId),
    }));
  };

  const estimatedMonthly = useMemo(() => {
    return form.serviceConfig.reduce((sum, l) => {
      const gross = l.displayPrice * l.quantity * (1 - l.discountPercent / 100);
      switch (l.billingFrequency) {
        case 'WEEKLY':
          return sum + (gross * 52) / 12;
        case 'QUARTERLY':
          return sum + gross / 3;
        case 'ANNUALLY':
          return sum + gross / 12;
        case 'ONE_TIME':
          return sum;
        default:
          return sum + gross;
      }
    }, 0);
  }, [form.serviceConfig]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Enter a template name');
      return;
    }
    if (!form.title.trim()) {
      toast.error('Enter a default proposal title');
      return;
    }
    if (form.serviceConfig.length === 0) {
      toast.error('Add at least one service to the template');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        title: form.title.trim(),
        coverLetter: form.coverLetter.trim() || undefined,
        serviceConfig: form.serviceConfig.map((l) => ({
          serviceId: l.serviceId,
          name: l.name,
          billingFrequency: l.billingFrequency,
          displayPrice: l.displayPrice,
          quantity: l.quantity,
          discountPercent: l.discountPercent,
        })),
      };

      const res =
        mode === 'edit' && templateId
          ? ((await apiClient.updateProposalTemplate(templateId, payload)) as any)
          : ((await apiClient.createProposalTemplate(payload)) as any);

      if (res.success) {
        toast.success(mode === 'edit' ? 'Template updated' : 'Template created');
        onSaved();
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        role="dialog"
        aria-labelledby="template-editor-title"
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-700"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div>
            <h2 id="template-editor-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              {mode === 'edit' ? 'Edit template' : 'New proposal template'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Bundle services, fees, and optional cover letter — reuse when creating proposals.
            </p>
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

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Template name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Standard limited company package"
                maxLength={120}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Default proposal title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Engagement proposal — annual accounts"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="When to use this template…"
              maxLength={500}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Cover letter <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={form.coverLetter}
              onChange={(e) => setForm((f) => ({ ...f, coverLetter: e.target.value }))}
              rows={4}
              placeholder="Default cover letter text when this template is applied…"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800 resize-none"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Services in template</h3>
              {form.serviceConfig.length > 0 && (
                <p className="text-xs text-slate-500">
                  ~{formatCurrency(estimatedMonthly)}/month equivalent (ex VAT)
                </p>
              )}
            </div>

            {form.serviceConfig.length > 0 && (
              <div className="space-y-2">
                {form.serviceConfig.map((line) => (
                  <div
                    key={line.serviceId}
                    className="flex flex-wrap items-end gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                  >
                    <div className="flex-1 min-w-[140px]">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{line.name}</p>
                    </div>
                    <div className="w-24">
                      <label className="text-xs text-slate-500">Price (£)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={line.displayPrice}
                        onChange={(e) =>
                          updateLine(line.serviceId, {
                            displayPrice: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-2 py-1 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
                      />
                    </div>
                    <div className="w-28">
                      <label className="text-xs text-slate-500">Frequency</label>
                      <select
                        value={line.billingFrequency}
                        onChange={(e) =>
                          updateLine(line.serviceId, { billingFrequency: e.target.value })
                        }
                        className="w-full px-2 py-1 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
                      >
                        {FREQUENCY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-16">
                      <label className="text-xs text-slate-500">Qty</label>
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(line.serviceId, { quantity: parseInt(e.target.value, 10) || 1 })
                        }
                        className="w-full px-2 py-1 text-sm rounded border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.serviceId)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      aria-label={`Remove ${line.name}`}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Add from catalogue
              </label>
              <input
                type="search"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="Search services…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800 mb-2"
              />
              {loadingCatalogue ? (
                <p className="text-xs text-slate-500">Loading catalogue…</p>
              ) : filteredCatalogue.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No services found.{' '}
                  <a href="/services" className="text-primary-600 hover:underline">
                    Add services
                  </a>{' '}
                  first.
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {filteredCatalogue.map((s) => {
                    const added = form.serviceConfig.some((l) => l.serviceId === s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={added}
                        onClick={() => addService(s)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg text-left transition-colors ${
                          added
                            ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800'
                            : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border border-transparent hover:border-emerald-200'
                        }`}
                      >
                        <span className="font-medium text-slate-800 dark:text-slate-200">{s.name}</span>
                        <span className="text-xs text-slate-500 shrink-0">
                          {added ? 'Added' : formatCurrency(s.priceAmount ?? 0)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 p-5 border-t border-slate-200 dark:border-slate-700 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary text-sm" disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="btn-primary text-sm inline-flex items-center gap-2"
          >
            <PlusIcon className="h-4 w-4" />
            {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create template'}
          </button>
        </div>
      </div>
    </div>
  );
}