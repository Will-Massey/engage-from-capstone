import { describe, it, expect } from 'vitest';
import {
  slugifyFieldId,
  uniqueFieldId,
  validateTemplateDraft,
  formatAnswer,
  sanitizeDraftForSave,
  duplicateAsDraft,
  type TemplateDraft,
} from '../formTemplateHelpers';

const baseDraft = (over: Partial<TemplateDraft> = {}): TemplateDraft => ({
  name: 'Records pack',
  description: '',
  category: 'Custom',
  fields: [{ id: 'q1', type: 'text', label: 'Question one' }],
  ...over,
});

describe('slugifyFieldId', () => {
  it('lowercases and underscores non-alphanumerics', () => {
    expect(slugifyFieldId('How many staff?')).toBe('how_many_staff');
    expect(slugifyFieldId('  VAT scheme (FRS) ')).toBe('vat_scheme_frs');
  });

  it('never returns an empty id and respects the 80-char cap', () => {
    expect(slugifyFieldId('???')).toBe('field');
    expect(slugifyFieldId('x'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe('uniqueFieldId', () => {
  it('returns the base when free and suffixes when taken', () => {
    expect(uniqueFieldId('staff', [])).toBe('staff');
    expect(uniqueFieldId('staff', ['staff'])).toBe('staff_2');
    expect(uniqueFieldId('staff', ['staff', 'staff_2'])).toBe('staff_3');
  });

  it('stays within the 80-char cap when suffixing', () => {
    const long = 'x'.repeat(80);
    expect(uniqueFieldId(long, [long]).length).toBeLessThanOrEqual(80);
  });
});

describe('validateTemplateDraft', () => {
  it('accepts a minimal valid draft', () => {
    expect(validateTemplateDraft(baseDraft())).toEqual([]);
  });

  it('requires a name and at least one field', () => {
    const problems = validateTemplateDraft(baseDraft({ name: '  ', fields: [] }));
    expect(problems).toContain('Template name is required');
    expect(problems).toContain('Add at least one field');
  });

  it('requires options on choice fields and labels on every field', () => {
    const problems = validateTemplateDraft(
      baseDraft({
        fields: [
          { id: 'a', type: 'select', label: 'Pick one', options: [' '] },
          { id: 'b', type: 'text', label: '' },
        ],
      })
    );
    expect(problems).toContain('Field 1: choice fields need at least one option');
    expect(problems).toContain('Field 2: label is required');
  });

  it('rejects duplicate field ids and >40 fields', () => {
    const dup = validateTemplateDraft(
      baseDraft({
        fields: [
          { id: 'a', type: 'text', label: 'One' },
          { id: 'a', type: 'text', label: 'Two' },
        ],
      })
    );
    expect(dup).toContain('Field ids must be unique');
    const many = validateTemplateDraft(
      baseDraft({
        fields: Array.from({ length: 41 }, (_, i) => ({
          id: `f${i}`,
          type: 'text' as const,
          label: `F${i}`,
        })),
      })
    );
    expect(many).toContain('Templates are capped at 40 fields');
  });
});

describe('formatAnswer', () => {
  it('renders booleans as Yes/No and empty values as a dash', () => {
    expect(formatAnswer({ id: 'a', type: 'boolean', label: 'Ready?' }, true)).toBe('Yes');
    expect(formatAnswer({ id: 'a', type: 'boolean', label: 'Ready?' }, false)).toBe('No');
    expect(formatAnswer(undefined, '')).toBe('—');
    expect(formatAnswer(undefined, null)).toBe('—');
  });

  it('formats date-field answers as en-GB and passes other values through', () => {
    expect(formatAnswer({ id: 'd', type: 'date', label: 'Year end' }, '2026-03-31')).toBe(
      '31/03/2026'
    );
    expect(formatAnswer({ id: 'd', type: 'date', label: 'Year end' }, 'not a date')).toBe(
      'not a date'
    );
    expect(formatAnswer({ id: 'n', type: 'number', label: 'Staff' }, 12)).toBe('12');
  });
});

describe('sanitizeDraftForSave', () => {
  it('trims strings, filters empty options, and strips options from non-select fields', () => {
    const cleaned = sanitizeDraftForSave(
      baseDraft({
        name: '  Pack  ',
        category: '  ',
        fields: [
          { id: 's', type: 'select', label: ' Scheme ', options: [' FRS ', '', 'Standard'] },
          { id: 't', type: 'text', label: 'Notes', options: ['stray'], placeholder: '  ' },
        ],
      })
    );
    expect(cleaned.name).toBe('Pack');
    expect(cleaned.category).toBe('Custom');
    expect(cleaned.fields[0]).toEqual({
      id: 's',
      type: 'select',
      label: 'Scheme',
      options: ['FRS', 'Standard'],
    });
    expect(cleaned.fields[1]).toEqual({ id: 't', type: 'text', label: 'Notes' });
  });
});

describe('duplicateAsDraft', () => {
  it('drops the id, marks the name, and deep-copies options', () => {
    const original = {
      name: 'Records pack',
      description: 'desc',
      category: 'Onboarding',
      fields: [{ id: 's', type: 'select' as const, label: 'Scheme', options: ['FRS', 'Standard'] }],
    };
    const draft = duplicateAsDraft(original);
    expect(draft.id).toBeUndefined();
    expect(draft.name).toBe('Records pack (copy)');
    draft.fields[0].options!.push('mutated');
    expect(original.fields[0].options).toEqual(['FRS', 'Standard']);
  });
});
