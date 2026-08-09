/**
 * Pure logic for the practice-forms template editor and response viewer.
 * Mirrors the backend zod caps on POST /forms/templates — validation here is
 * a UX courtesy; the server remains authoritative.
 */

export type FormFieldType = 'text' | 'textarea' | 'boolean' | 'select' | 'date' | 'number';

export type EditableField = {
  id: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  options?: string[];
  placeholder?: string;
};

export type TemplateDraft = {
  id?: string;
  name: string;
  description: string;
  category: string;
  isActive?: boolean;
  fields: EditableField[];
};

export const FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Choice' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
];

/** Stable id from a label: lowercase, underscores, trimmed to the 80-char cap. */
export function slugifyFieldId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return slug || 'field';
}

/** Suffix _2, _3… until the id is free (backend rejects duplicates with 400). */
export function uniqueFieldId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) {
    // Keep within the 80-char cap even once suffixed.
    const candidate = `${base.slice(0, 76)}_${n}`;
    if (!set.has(candidate)) return candidate;
  }
}

/** Problems preventing save, in display order. Empty array = valid draft. */
export function validateTemplateDraft(draft: TemplateDraft): string[] {
  const problems: string[] = [];
  if (!draft.name.trim()) problems.push('Template name is required');
  if (draft.name.length > 120) problems.push('Template name must be 120 characters or fewer');
  if (draft.description.length > 500) problems.push('Description must be 500 characters or fewer');
  if (draft.category.length > 80) problems.push('Category must be 80 characters or fewer');
  if (draft.fields.length === 0) problems.push('Add at least one field');
  if (draft.fields.length > 40) problems.push('Templates are capped at 40 fields');
  draft.fields.forEach((f, i) => {
    const where = `Field ${i + 1}`;
    if (!f.label.trim()) problems.push(`${where}: label is required`);
    if (f.label.length > 200) problems.push(`${where}: label must be 200 characters or fewer`);
    if (f.type === 'select' && !(f.options || []).some((o) => o.trim())) {
      problems.push(`${where}: choice fields need at least one option`);
    }
  });
  const ids = draft.fields.map((f) => f.id);
  if (new Set(ids).size !== ids.length) problems.push('Field ids must be unique');
  return problems;
}

/** Render a stored answer for display: booleans → Yes/No, date fields → en-GB. */
export function formatAnswer(field: EditableField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (field?.type === 'date') {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-GB');
  }
  return String(value);
}

/** Shape a draft for POST /forms/templates: trim, drop empty options/placeholders,
 * and only send options on choice fields. */
export function sanitizeDraftForSave(draft: TemplateDraft): TemplateDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    category: draft.category.trim() || 'Custom',
    fields: draft.fields.map((f) => {
      const options =
        f.type === 'select' ? (f.options || []).map((o) => o.trim()).filter(Boolean) : undefined;
      const placeholder = f.placeholder?.trim() || undefined;
      return {
        id: f.id,
        type: f.type,
        label: f.label.trim(),
        ...(f.required ? { required: true } : {}),
        ...(options ? { options } : {}),
        ...(placeholder ? { placeholder } : {}),
      };
    }),
  };
}

/** Duplicate a template as a new draft (drops the id, marks the name). */
export function duplicateAsDraft(template: {
  name: string;
  description: string;
  category: string;
  fields: EditableField[];
}): TemplateDraft {
  return {
    name: `${template.name} (copy)`.slice(0, 120),
    description: template.description,
    category: template.category,
    isActive: true,
    fields: template.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
  };
}
