/** Optional practice-signup answers. Stored as the value, shown as the label. */

export const HEARD_ABOUT_OPTIONS = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'google', label: 'Google' },
  { value: 'professional_body', label: 'AAT or another professional body' },
  { value: 'xero', label: 'Xero app store or community' },
  { value: 'another_accountant', label: 'Another accountant' },
  { value: 'other', label: 'Other' },
] as const;

export type HeardAboutValue = (typeof HEARD_ABOUT_OPTIONS)[number]['value'];

const HEARD_ABOUT_VALUE_SET = new Set<string>(HEARD_ABOUT_OPTIONS.map((option) => option.value));

export function isHeardAboutValue(value: string): value is HeardAboutValue {
  return HEARD_ABOUT_VALUE_SET.has(value);
}

export function heardAboutLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = HEARD_ABOUT_OPTIONS.find((option) => option.value === value);
  return match ? match.label : value;
}
