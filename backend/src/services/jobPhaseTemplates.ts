/**
 * Default work-phase + checklist templates by UK service category.
 * Used when spawning a Job from an accepted proposal's service lines.
 */

export interface PhaseTemplate {
  name: string;
  checklist: string[];
}

export interface CategoryTemplate {
  category: string;
  phases: PhaseTemplate[];
}

const GENERIC: CategoryTemplate = {
  category: 'GENERIC',
  phases: [
    {
      name: 'Collect information',
      checklist: ['Request records from client', 'Confirm scope and contacts'],
    },
    {
      name: 'Prepare',
      checklist: ['Complete core work', 'Internal QC'],
    },
    {
      name: 'Review & deliver',
      checklist: ['Partner review', 'Send deliverables', 'Close job'],
    },
  ],
};

const BY_CATEGORY: Record<string, CategoryTemplate> = {
  COMPLIANCE: {
    category: 'COMPLIANCE',
    phases: [
      {
        name: 'Request records',
        checklist: ['Send records checklist', 'Chase missing items', 'Confirm period end'],
      },
      {
        name: 'Preparation',
        checklist: ['Bookkeeping complete', 'Draft accounts / return', 'Tax computations'],
      },
      {
        name: 'Review',
        checklist: ['Manager review', 'Partner sign-off'],
      },
      {
        name: 'Filing',
        checklist: [
          'Client approval',
          'File with Companies House / HMRC',
          'Archive working papers',
        ],
      },
    ],
  },
  BOOKKEEPING: {
    category: 'BOOKKEEPING',
    phases: [
      {
        name: 'Receive bank feeds',
        checklist: ['Connect software', 'Import statements'],
      },
      {
        name: 'Reconcile',
        checklist: ['Code transactions', 'Reconcile accounts', 'Query exceptions'],
      },
      {
        name: 'Report',
        checklist: ['Management pack', 'Client review call'],
      },
    ],
  },
  ADVISORY: {
    category: 'ADVISORY',
    phases: [
      {
        name: 'Scoping',
        checklist: ['Kick-off call', 'Data request'],
      },
      {
        name: 'Analysis',
        checklist: ['Workpapers', 'Draft recommendations'],
      },
      {
        name: 'Delivery',
        checklist: ['Present findings', 'Issue final report'],
      },
    ],
  },
  MTD_ITSA: {
    category: 'MTD_ITSA',
    phases: [
      {
        name: 'Digital setup',
        checklist: ['Confirm software', 'Map income sources'],
      },
      {
        name: 'Quarterly update',
        checklist: ['Pull figures', 'Client confirm', 'Submit quarterly update'],
      },
    ],
  },
  SPECIALIST: {
    category: 'SPECIALIST',
    phases: [
      {
        name: 'Engagement setup',
        checklist: ['Conflict check', 'Planning memo'],
      },
      {
        name: 'Fieldwork',
        checklist: ['Evidence gathering', 'Working papers'],
      },
      {
        name: 'Reporting',
        checklist: ['Draft report', 'Partner review', 'Issue'],
      },
    ],
  },
  ONBOARDING: {
    category: 'ONBOARDING',
    phases: [
      {
        name: 'Welcome',
        checklist: ['Send welcome pack', 'Collect ID / AML'],
      },
      {
        name: 'Systems',
        checklist: ['Portal access', 'Software invites', 'Authority forms'],
      },
      {
        name: 'Handover',
        checklist: ['Assign team', 'First deadline calendar'],
      },
    ],
  },
};

export function resolveCategoryTemplate(category?: string | null): CategoryTemplate {
  if (!category) return GENERIC;
  const key = category.toUpperCase().replace(/\s+/g, '_');
  return BY_CATEGORY[key] || BY_CATEGORY[category.toUpperCase()] || GENERIC;
}

/** Map loose service names into a category when ServiceTemplate.category is missing. */
export function inferCategoryFromServiceName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('onboard')) return 'ONBOARDING';
  if (n.includes('bookkeep') || n.includes('payroll')) return 'BOOKKEEPING';
  if (n.includes('mtd') || n.includes('itsa')) return 'MTD_ITSA';
  if (n.includes('audit') || n.includes('forensic') || n.includes('r&d')) return 'SPECIALIST';
  if (n.includes('planning') || n.includes('advisory') || n.includes('forecast')) return 'ADVISORY';
  if (
    n.includes('account') ||
    n.includes('ct600') ||
    n.includes('vat') ||
    n.includes('self assessment') ||
    n.includes('sa100') ||
    n.includes('confirmation')
  ) {
    return 'COMPLIANCE';
  }
  return 'GENERIC';
}
