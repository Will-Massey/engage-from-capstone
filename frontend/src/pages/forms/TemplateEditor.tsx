import { useEffect, useState } from 'react';
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import {
  FIELD_TYPES,
  slugifyFieldId,
  uniqueFieldId,
  validateTemplateDraft,
  type EditableField,
  type TemplateDraft,
} from './formTemplateHelpers';

type Props = {
  initialDraft: TemplateDraft;
  busy: boolean;
  onSave: (draft: TemplateDraft) => void;
  onCancel: () => void;
};

/** Modal editor for practice form templates — create, edit, duplicate. */
export default function TemplateEditor({ initialDraft, busy, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<TemplateDraft>(initialDraft);
  const [showProblems, setShowProblems] = useState(false);
  const problems = validateTemplateDraft(draft);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  function patchField(index: number, patch: Partial<EditableField>) {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  }

  function addField() {
    setDraft((d) => {
      const id = uniqueFieldId(
        'question',
        d.fields.map((f) => f.id)
      );
      return { ...d, fields: [...d.fields, { id, type: 'text', label: '' }] };
    });
  }

  function removeField(index: number) {
    setDraft((d) => ({ ...d, fields: d.fields.filter((_, i) => i !== index) }));
  }

  function moveField(index: number, delta: -1 | 1) {
    setDraft((d) => {
      const next = [...d.fields];
      const target = index + delta;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, fields: next };
    });
  }

  /** Re-derive the field id from its label (new fields only — editing an
   * existing template keeps stored ids so submitted answers stay linked). */
  function relabelField(index: number, label: string) {
    setDraft((d) => {
      const fields = d.fields.map((f, i) => {
        if (i !== index) return f;
        if (d.id) return { ...f, label };
        const others = d.fields.filter((_, j) => j !== index).map((x) => x.id);
        return { ...f, label, id: uniqueFieldId(slugifyFieldId(label), others) };
      });
      return { ...d, fields };
    });
  }

  function handleSave() {
    if (problems.length > 0) {
      setShowProblems(true);
      return;
    }
    onSave(draft);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-editor-title"
      onClick={onCancel}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="template-editor-title"
          className="text-lg font-semibold text-slate-900 dark:text-white"
        >
          {draft.id ? 'Edit template' : 'New template'}
        </h3>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-500 sm:col-span-2">
            Name
            <input
              className="input-field mt-1 text-sm"
              value={draft.name}
              maxLength={120}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </label>
          <label className="block text-xs text-slate-500">
            Category
            <input
              className="input-field mt-1 text-sm"
              value={draft.category}
              maxLength={80}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
            />
          </label>
          <label className="block text-xs text-slate-500">
            Description
            <textarea
              className="input-field mt-1 text-sm"
              rows={2}
              value={draft.description}
              maxLength={500}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Fields ({draft.fields.length}/40)
          </h4>
          <button
            type="button"
            className="btn-secondary btn-sm text-xs"
            onClick={addField}
            disabled={draft.fields.length >= 40}
          >
            <PlusIcon className="h-4 w-4" /> Add field
          </button>
        </div>

        <ul className="mt-2 space-y-2">
          {draft.fields.map((f, i) => (
            <li key={f.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-xs text-slate-500">
                  Label
                  <input
                    className="input-field mt-1 text-sm"
                    value={f.label}
                    maxLength={200}
                    onChange={(e) => relabelField(i, e.target.value)}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Type
                  <select
                    className="input-field mt-1 text-sm"
                    value={f.type}
                    onChange={(e) =>
                      patchField(i, { type: e.target.value as EditableField['type'] })
                    }
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={!!f.required}
                    onChange={(e) => patchField(i, { required: e.target.checked })}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Required
                </label>
                <div className="flex gap-1 pb-1">
                  <button
                    type="button"
                    className="btn-ghost btn-sm !min-h-7 !px-1.5"
                    aria-label="Move field up"
                    disabled={i === 0}
                    onClick={() => moveField(i, -1)}
                  >
                    <ArrowUpIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm !min-h-7 !px-1.5"
                    aria-label="Move field down"
                    disabled={i === draft.fields.length - 1}
                    onClick={() => moveField(i, 1)}
                  >
                    <ArrowDownIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="btn-ghost btn-sm !min-h-7 !px-1.5 text-rose-500"
                    aria-label="Remove field"
                    onClick={() => removeField(i)}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {f.type === 'select' && (
                <label className="mt-2 block text-xs text-slate-500">
                  Options (one per line)
                  <textarea
                    className="input-field mt-1 text-sm"
                    rows={2}
                    value={(f.options || []).join('\n')}
                    onChange={(e) => patchField(i, { options: e.target.value.split('\n') })}
                  />
                </label>
              )}
              {f.type === 'text' || f.type === 'textarea' ? (
                <label className="mt-2 block text-xs text-slate-500">
                  Placeholder (optional)
                  <input
                    className="input-field mt-1 text-sm"
                    value={f.placeholder || ''}
                    onChange={(e) => patchField(i, { placeholder: e.target.value })}
                  />
                </label>
              ) : null}
            </li>
          ))}
        </ul>

        {showProblems && problems.length > 0 && (
          <ul className="mt-3 space-y-0.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost text-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Create template'}
          </button>
        </div>
      </div>
    </div>
  );
}
