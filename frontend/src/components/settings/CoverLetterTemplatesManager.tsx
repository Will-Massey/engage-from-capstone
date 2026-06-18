import { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import { DocumentTextIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

const TONE_LABELS: Record<string, string> = {
  PROFESSIONAL: 'Professional',
  FRIENDLY: 'Friendly',
  MODERN: 'Modern',
};

export default function CoverLetterTemplatesManager() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [mergeFields, setMergeFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', tone: 'PROFESSIONAL', content: '', isDefault: false });

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, mRes] = await Promise.all([
        apiClient.getCoverLetterTemplates(),
        apiClient.getCoverLetterMergeFields(),
      ]);
      setTemplates((tRes as any).data || []);
      setMergeFields((mRes as any).data?.fields?.map((f: any) => f.key || f) || []);
    } catch {
      toast.error('Failed to load cover letter templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing({ id: null });
    setForm({
      name: '',
      tone: 'PROFESSIONAL',
      content:
        'Dear {{clientName}},\n\nThank you for considering {{tenantName}} for your accounting needs.\n\n{{servicesSummary}}\n\nKind regards,\n{{senderName}}',
      isDefault: false,
    });
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      name: t.name,
      tone: t.tone,
      content: t.content,
      isDefault: !!t.isDefault,
    });
  };

  const save = async () => {
    if (!form.name.trim() || form.content.length < 10) {
      toast.error('Name and content (min 10 chars) are required');
      return;
    }
    try {
      if (editing?.id) {
        await apiClient.updateCoverLetterTemplate(editing.id, form);
        toast.success('Template updated');
      } else {
        await apiClient.createCoverLetterTemplate(form);
        toast.success('Template created');
      }
      setEditing(null);
      await load();
    } catch {
      toast.error('Failed to save template');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      await apiClient.deleteCoverLetterTemplate(id);
      toast.success('Template deleted');
      await load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const insertField = (field: string) => {
    const token = `{{${field}}}`;
    setForm((f) => ({ ...f, content: f.content + token }));
  };

  if (loading) {
    return <div className="p-6 text-center text-slate-500">Loading templates…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Cover letter templates</h3>
          <p className="text-xs text-slate-500 mt-0.5">Reusable templates with merge fields for proposals</p>
        </div>
        <button type="button" onClick={openNew} className="btn-secondary text-sm inline-flex items-center gap-1">
          <PlusIcon className="h-4 w-4" />
          New template
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-slate-500 py-4">No custom templates yet — create one or use tones in the proposal builder.</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 px-4 py-3 bg-white/50 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <button type="button" onClick={() => openEdit(t)} className="text-left flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-900 dark:text-white truncate">{t.name}</div>
                <div className="text-xs text-slate-500">
                  {TONE_LABELS[t.tone] || t.tone}
                  {t.isDefault ? ' · Default' : ''}
                </div>
              </button>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="p-2 text-slate-400 hover:text-red-600"
                aria-label="Delete template"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-primary-700 dark:text-primary-300">
            <DocumentTextIcon className="h-5 w-5" />
            <span className="font-medium text-sm">{editing.id ? 'Edit template' : 'New template'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="input-field"
              placeholder="Template name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className="input-field"
              value={form.tone}
              onChange={(e) => setForm({ ...form, tone: e.target.value })}
            >
              {Object.entries(TONE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {mergeFields.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {mergeFields.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => insertField(f)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-primary-400"
                >
                  {`{{${f}}}`}
                </button>
              ))}
            </div>
          )}
          <textarea
            className="input-field w-full min-h-[160px] font-mono text-sm"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="rounded border-slate-300"
            />
            Set as default for this tone
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="btn-primary text-sm">
              Save template
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn-secondary text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
