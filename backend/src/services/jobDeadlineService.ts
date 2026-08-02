/**
 * Statutory / internal deadline hints for practice jobs (UK).
 * Deterministic rules — not LLM. Used at job spawn and for board badges.
 */

export type DeadlineKind = 'STATUTORY' | 'INTERNAL' | 'NONE';

export interface DeadlineHint {
  dueAt: Date | null;
  deadlineKind: DeadlineKind;
  ruleId: string;
  label: string;
}

export interface DeadlineInput {
  serviceNames: string[];
  /** Client accounting year-end as DD/MM or MM-DD or ISO date string */
  yearEnd?: string | null;
  nextVatDueDate?: Date | null;
  nextAccountsDueDate?: Date | null;
  nextConfirmationStatementDue?: Date | null;
  /** Anchor for "next occurrence" calculations (default now) */
  now?: Date;
}

function parseYearEnd(yearEnd: string | null | undefined, now: Date): Date | null {
  if (!yearEnd?.trim()) return null;
  const s = yearEnd.trim();

  // DD/MM or D/M
  const uk = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (uk) {
    const day = parseInt(uk[1], 10);
    const month = parseInt(uk[2], 10) - 1;
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    let y = now.getFullYear();
    let d = new Date(y, month, day, 23, 59, 59, 999);
    if (d.getTime() < now.getTime()) {
      d = new Date(y + 1, month, day, 23, 59, 59, 999);
    }
    return d;
  }

  // ISO
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  return null;
}

/** 9 months after year-end for private company accounts filing (Companies House) */
function accountsFilingDue(yearEndDate: Date): Date {
  const d = new Date(yearEndDate);
  d.setMonth(d.getMonth() + 9);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** 12 months after year-end for CT600 (simplified) */
function ct600Due(yearEndDate: Date): Date {
  const d = new Date(yearEndDate);
  d.setFullYear(d.getFullYear() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

function nextSaDeadline(now: Date): Date {
  // Online SA: 31 January following tax year
  const year = now.getMonth() > 0 || (now.getMonth() === 0 && now.getDate() > 31)
    ? now.getFullYear() + 1
    : now.getFullYear();
  // If we're before 31 Jan this calendar year, use this year
  const thisJan = new Date(now.getFullYear(), 0, 31, 23, 59, 59, 999);
  if (now.getTime() <= thisJan.getTime()) return thisJan;
  return new Date(now.getFullYear() + 1, 0, 31, 23, 59, 59, 999);
}

function classifyServices(names: string[]): {
  accounts: boolean;
  ct600: boolean;
  sa: boolean;
  vat: boolean;
  payroll: boolean;
  confirmation: boolean;
  mtd: boolean;
} {
  const joined = names.map((n) => n.toLowerCase()).join(' | ');
  return {
    accounts: /annual account|statutory account|accounts preparation|year.?end/.test(joined),
    ct600: /ct600|corporation tax/.test(joined),
    sa: /self assessment|sa100|personal tax/.test(joined),
    vat: /\bvat\b/.test(joined),
    payroll: /payroll|p11d|rti/.test(joined),
    confirmation: /confirmation statement|cs01/.test(joined),
    mtd: /mtd|itsa/.test(joined),
  };
}

/**
 * Pick the earliest relevant deadline for the engagement.
 */
export function computeJobDeadline(input: DeadlineInput): DeadlineHint {
  const now = input.now ?? new Date();
  const flags = classifyServices(input.serviceNames);
  const candidates: DeadlineHint[] = [];

  if (input.nextAccountsDueDate && flags.accounts) {
    candidates.push({
      dueAt: new Date(input.nextAccountsDueDate),
      deadlineKind: 'STATUTORY',
      ruleId: 'client-accounts-due',
      label: 'Accounts filing (client record)',
    });
  }

  if (input.nextVatDueDate && (flags.vat || flags.mtd)) {
    candidates.push({
      dueAt: new Date(input.nextVatDueDate),
      deadlineKind: 'STATUTORY',
      ruleId: 'client-vat-due',
      label: 'VAT return (client record)',
    });
  }

  if (input.nextConfirmationStatementDue && flags.confirmation) {
    candidates.push({
      dueAt: new Date(input.nextConfirmationStatementDue),
      deadlineKind: 'STATUTORY',
      ruleId: 'client-cs-due',
      label: 'Confirmation statement (client record)',
    });
  }

  const ye = parseYearEnd(input.yearEnd, now);
  if (ye && flags.accounts) {
    candidates.push({
      dueAt: accountsFilingDue(ye),
      deadlineKind: 'STATUTORY',
      ruleId: 'ch-accounts-9m',
      label: 'Companies House accounts (YE + 9 months)',
    });
  }
  if (ye && flags.ct600) {
    candidates.push({
      dueAt: ct600Due(ye),
      deadlineKind: 'STATUTORY',
      ruleId: 'ct600-12m',
      label: 'Corporation tax return (YE + 12 months)',
    });
  }

  if (flags.sa) {
    candidates.push({
      dueAt: nextSaDeadline(now),
      deadlineKind: 'STATUTORY',
      ruleId: 'sa-31-jan',
      label: 'Self Assessment (31 January)',
    });
  }

  if (flags.payroll) {
    // Internal: end of next calendar month
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    candidates.push({
      dueAt: d,
      deadlineKind: 'INTERNAL',
      ruleId: 'payroll-month-end',
      label: 'Payroll month-end (internal)',
    });
  }

  // Prefer statutory over internal; then earliest date
  const statutory = candidates.filter((c) => c.deadlineKind === 'STATUTORY' && c.dueAt);
  const pool = statutory.length > 0 ? statutory : candidates.filter((c) => c.dueAt);
  if (pool.length === 0) {
    return { dueAt: null, deadlineKind: 'NONE', ruleId: 'none', label: 'No deadline inferred' };
  }

  pool.sort((a, b) => (a.dueAt!.getTime() - b.dueAt!.getTime()));
  return pool[0];
}
