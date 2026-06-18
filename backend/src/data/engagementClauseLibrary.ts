/**
 * Firm-approved engagement letter clauses — AI selects from this library only.
 * IDs are stable for audit; bodies use UK English and professional register.
 */

export interface EngagementClause {
  id: string;
  title: string;
  tags: string[];
  body: string;
}

export const ENGAGEMENT_CLAUSE_LIBRARY: EngagementClause[] = [
  {
    id: 'scope-annual-accounts',
    title: 'Annual accounts preparation',
    tags: ['annual-accounts', 'accounts', 'compliance', 'companies-house'],
    body: `We will prepare statutory annual accounts in accordance with applicable UK GAAP (including FRS 102 or FRS 105 where relevant), including the directors' report and notes, and file them with Companies House within statutory deadlines.`,
  },
  {
    id: 'scope-corporation-tax',
    title: 'Corporation tax',
    tags: ['ct600', 'corporation-tax', 'tax', 'compliance'],
    body: `We will prepare your Corporation Tax return (CT600), tax computations, and supporting schedules, and submit them to HMRC electronically within the statutory filing deadline.`,
  },
  {
    id: 'scope-confirmation-statement',
    title: 'Confirmation statement',
    tags: ['confirmation-statement', 'cs01', 'compliance'],
    body: `We will verify your company details and file the annual Confirmation Statement (CS01) with Companies House.`,
  },
  {
    id: 'scope-vat',
    title: 'VAT returns',
    tags: ['vat', 'mtd', 'compliance', 'tax'],
    body: `We will prepare and submit VAT returns via Making Tax Digital (MTD) compatible software, reconcile VAT control accounts, and advise on VAT treatment of transactions.`,
  },
  {
    id: 'scope-payroll',
    title: 'Payroll & RTI',
    tags: ['payroll', 'rti', 'paye', 'compliance'],
    body: `We will operate your payroll, issue payslips, submit Real Time Information (RTI) returns to HMRC, and provide year-end P60s. Auto-enrolment assessments will be performed where applicable.`,
  },
  {
    id: 'scope-bookkeeping',
    title: 'Bookkeeping',
    tags: ['bookkeeping', 'accounts'],
    body: `We will maintain your accounting records, perform bank reconciliations, and produce management information as agreed. You remain responsible for providing complete and accurate source documents in a timely manner.`,
  },
  {
    id: 'scope-self-assessment',
    title: 'Self Assessment',
    tags: ['self-assessment', 'sa100', 'personal-tax', 'tax'],
    body: `We will prepare and submit your Self Assessment tax return to HMRC, calculating tax liabilities and advising on payments on account where relevant.`,
  },
  {
    id: 'scope-aml',
    title: 'Anti-money laundering',
    tags: ['aml', 'compliance', 'kyc'],
    body: `We will perform client due diligence in line with Money Laundering Regulations 2017, including identity verification and risk assessment, before commencing work.`,
  },
  {
    id: 'scope-advisory',
    title: 'Advisory services',
    tags: ['advisory', 'consulting', 'planning'],
    body: `We will provide advisory services as specified in your proposal. Advisory work is limited to the agreed scope and does not constitute an audit or assurance engagement unless explicitly stated.`,
  },
  {
    id: 'scope-registered-office',
    title: 'Registered office',
    tags: ['registered-office', 'address', 'specialized'],
    body: `We will provide a registered office address service, forward statutory correspondence, and remind you of key filing deadlines. You must notify us promptly of any changes to directors or shareholders.`,
  },
  {
    id: 'client-records',
    title: 'Client record-keeping',
    tags: ['_always'],
    body: `You are responsible for maintaining adequate accounting records for six years (HMRC requirement) and providing information promptly when requested. Delays may affect our ability to meet statutory deadlines.`,
  },
  {
    id: 'fees-payment',
    title: 'Fees and payment',
    tags: ['_always'],
    body: `Fees are as set out in your proposal. Invoices are payable within the stated payment terms. We may suspend services if fees remain outstanding beyond 30 days without prior agreement.`,
  },
  {
    id: 'limitation-liability',
    title: 'Limitation of liability',
    tags: ['_always'],
    body: `Our liability in respect of any claim arising from this engagement is limited to the amount of fees paid for the services giving rise to the claim in the twelve months preceding the event, except where prohibited by law or professional regulations.`,
  },
];

export function selectClausesForServices(
  services: Array<{ name: string; tags?: string }>
): EngagementClause[] {
  const selected = new Map<string, EngagementClause>();

  for (const clause of ENGAGEMENT_CLAUSE_LIBRARY) {
    if (clause.tags.includes('_always')) {
      selected.set(clause.id, clause);
    }
  }

  const allTags = services.flatMap((s) => {
    const fromField = (s.tags || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const nameTokens = s.name.toLowerCase().split(/\s+/);
    return [...fromField, ...nameTokens];
  });

  for (const clause of ENGAGEMENT_CLAUSE_LIBRARY) {
    if (clause.tags.includes('_always')) continue;
    const matches = clause.tags.some((tag) =>
      allTags.some((t) => t.includes(tag) || tag.includes(t))
    );
    if (matches) selected.set(clause.id, clause);
  }

  return Array.from(selected.values());
}

export function assembleEngagementLetterFromClauses(
  practiceName: string,
  clientName: string,
  clauses: EngagementClause[],
  feesSummary: string,
  periodLabel: string
): string {
  const scopeSection = clauses
    .filter((c) => !c.tags.includes('_always'))
    .map((c, i) => `### ${i + 1}. ${c.title}\n\n${c.body}`)
    .join('\n\n');

  const termsSection = clauses
    .filter((c) => c.tags.includes('_always'))
    .map((c) => `### ${c.title}\n\n${c.body}`)
    .join('\n\n');

  return `# Letter of engagement

**${practiceName}** — professional accountancy services for **${clientName}**

**Period:** ${periodLabel}

---

## Scope of services

${scopeSection || '_Services as detailed in your accepted proposal._'}

---

## Fees

${feesSummary}

---

## Terms

${termsSection}

---

*This letter supplements your proposal and terms of business. Please retain a copy for your records.*`;
}
