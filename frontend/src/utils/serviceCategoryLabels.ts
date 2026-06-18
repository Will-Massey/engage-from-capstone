/**
 * Human-readable UK labels for service catalog categories (Prisma enum values).
 */
export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  ALL: 'All categories',
  COMPLIANCE: 'Compliance',
  TAX: 'Tax',
  PAYROLL: 'Payroll',
  BOOKKEEPING: 'Bookkeeping',
  TECHNICAL: 'Technical',
  SPECIALIZED: 'Office address',
  ADVISORY: 'Advisory',
  AUDIT: 'Audit',
  CONSULTING: 'Consulting',
  MTD_ITSA: 'MTD ITSA',
};

export function formatServiceCategory(category: string): string {
  if (!category) return '';
  return (
    SERVICE_CATEGORY_LABELS[category] ||
    category
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Options for category filter / form selects (excludes ALL). */
export const SERVICE_CATEGORY_OPTIONS = (
  Object.entries(SERVICE_CATEGORY_LABELS).filter(([key]) => key !== 'ALL') as Array<
    [string, string]
  >
).map(([value, label]) => ({ value, label }));
