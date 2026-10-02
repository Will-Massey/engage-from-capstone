/**
 * Internal first-win log for a practice (tenant).
 *
 * A first win is the first time that practice sends a proposal or an
 * engagement letter to a client. Drafts do not count. The write is once-only:
 * a later send leaves the original timestamp in place.
 *
 * Signup time is Tenant.createdAt, set when the practice is created.
 */

import { prisma } from '../config/database.js';
import logger from '../config/logger.js';
import {
  isLoeOnlyProposalFields,
  parseProposalCustomFields,
} from '../utils/proposalCustomFields.js';
import { heardAboutLabel } from '../constants/heardAbout.js';

export const FIRST_WIN_KINDS = ['proposal', 'engagement_letter'] as const;
export type FirstWinKind = (typeof FIRST_WIN_KINDS)[number];

export const FIRST_WIN_METHODS = ['emailed', 'link_copied'] as const;
export type FirstWinMethod = (typeof FIRST_WIN_METHODS)[number];

export interface FirstWinRecord {
  at: string;
  kind: string;
  method: FirstWinMethod | null;
}

export const ONBOARDING_STEPS = [
  'signed_up',
  'email_verified',
  'client_added',
  'proposal_drafted',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const ONBOARDING_STEP_LABEL: Record<OnboardingStep, string> = {
  signed_up: 'Signed up',
  email_verified: 'Verified their email',
  client_added: 'Added a client',
  proposal_drafted: 'Saved a proposal or engagement letter, not sent yet',
};

export function firstWinKindForProposal(customFields: string | null | undefined): FirstWinKind {
  return isLoeOnlyProposalFields(parseProposalCustomFields(customFields))
    ? 'engagement_letter'
    : 'proposal';
}

/**
 * Record the practice's first win if it has not been recorded yet.
 * Never throws — a logging failure must not stop the send the practice just made.
 */
export async function recordPracticeFirstWin(
  tenantId: string,
  kind: FirstWinKind,
  method: FirstWinMethod,
  occurredAt: Date = new Date()
): Promise<void> {
  try {
    await prisma.tenant.updateMany({
      where: { id: tenantId, firstWinAt: null },
      data: { firstWinAt: occurredAt, firstWinKind: kind, firstWinMethod: method },
    });
  } catch (error) {
    try {
      logger.warn('practice first win was not recorded', {
        tenantId,
        kind,
        method,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Swallow. The send has already succeeded.
    }
  }
}

export function furthestOnboardingStep(input: {
  emailVerified: boolean;
  clientCount: number;
  proposalCount: number;
}): { id: OnboardingStep; label: string } {
  let id: OnboardingStep = 'signed_up';
  if (input.emailVerified) id = 'email_verified';
  if (input.clientCount > 0) id = 'client_added';
  if (input.proposalCount > 0) id = 'proposal_drafted';
  return { id, label: ONBOARDING_STEP_LABEL[id] };
}

const UTC_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Inclusive start and exclusive end of a UTC calendar day. Null when the date is not real. */
export function utcDayBounds(date: string): { start: Date; end: Date } | null {
  const match = UTC_DAY.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day
  ) {
    return null;
  }
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export interface SignupAttributionReport {
  heardAbout: string | null;
  heardAboutOther: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  referrer: string | null;
}

export interface FirstWinDailyReport {
  date: string;
  timezone: 'UTC';
  signups: Array<
    {
      tenantId: string;
      practiceName: string;
      subdomain: string;
      signupEmail: string | null;
      signedUpAt: string;
      firstWin: FirstWinRecord | null;
      furthestOnboardingStep: { id: OnboardingStep; label: string } | null;
    } & SignupAttributionReport
  >;
  firstWinsRecordedOnDate: Array<
    {
      tenantId: string;
      practiceName: string;
      subdomain: string;
      signupEmail: string | null;
      signedUpAt: string;
      firstWin: FirstWinRecord;
    } & SignupAttributionReport
  >;
  summary: {
    signups: number;
    signupsWithFirstWin: number;
    signupsStillOnboarding: number;
    firstWinsRecordedOnDate: number;
  };
}

type TenantReportRow = {
  id: string;
  name: string;
  subdomain: string;
  createdAt: Date;
  firstWinAt: Date | null;
  firstWinKind: string | null;
  firstWinMethod: string | null;
  heardAbout?: string | null;
  heardAboutOther?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  signupReferrer?: string | null;
  users: Array<{ email: string; emailVerified: Date | null; createdAt: Date }>;
  _count?: { clients: number; proposals: number };
};

function attributionOf(row: TenantReportRow): SignupAttributionReport {
  return {
    heardAbout: heardAboutLabel(row.heardAbout),
    heardAboutOther: row.heardAbout === 'other' ? (row.heardAboutOther ?? null) : null,
    utmSource: row.utmSource ?? null,
    utmMedium: row.utmMedium ?? null,
    utmCampaign: row.utmCampaign ?? null,
    referrer: row.signupReferrer ?? null,
  };
}

function signupEmail(row: TenantReportRow): string | null {
  const first = [...row.users].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  return first?.email ?? null;
}

function firstWinOf(row: TenantReportRow): FirstWinRecord | null {
  if (!row.firstWinAt) return null;
  const method =
    row.firstWinMethod === 'emailed' || row.firstWinMethod === 'link_copied'
      ? row.firstWinMethod
      : null;
  return { at: row.firstWinAt.toISOString(), kind: row.firstWinKind || 'proposal', method };
}

/**
 * Practices that signed up on the UTC day, plus any first wins timestamped that day
 * (including practices that signed up earlier).
 */
export async function buildFirstWinDailyReport(date: string): Promise<FirstWinDailyReport> {
  const bounds = utcDayBounds(date);
  if (!bounds) {
    throw new Error('date must be YYYY-MM-DD');
  }

  const signupSelect = {
    id: true,
    name: true,
    subdomain: true,
    createdAt: true,
    firstWinAt: true,
    firstWinKind: true,
    firstWinMethod: true,
    heardAbout: true,
    heardAboutOther: true,
    utmSource: true,
    utmMedium: true,
    utmCampaign: true,
    signupReferrer: true,
    users: {
      select: { email: true, emailVerified: true, createdAt: true },
    },
    _count: { select: { clients: true, proposals: true } },
  } as const;

  const [signups, wins] = await Promise.all([
    prisma.tenant.findMany({
      where: { createdAt: { gte: bounds.start, lt: bounds.end } },
      orderBy: { createdAt: 'asc' },
      select: signupSelect,
    }),
    prisma.tenant.findMany({
      where: { firstWinAt: { gte: bounds.start, lt: bounds.end } },
      orderBy: { firstWinAt: 'asc' },
      select: {
        id: true,
        name: true,
        subdomain: true,
        createdAt: true,
        firstWinAt: true,
        firstWinKind: true,
        firstWinMethod: true,
        heardAbout: true,
        heardAboutOther: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        signupReferrer: true,
        users: { select: { email: true, emailVerified: true, createdAt: true } },
      },
    }),
  ]);

  const signupRows = signups.map((row) => {
    const win = firstWinOf(row);
    const emailVerified = row.users.some((user) => user.emailVerified != null);
    return {
      tenantId: row.id,
      practiceName: row.name,
      subdomain: row.subdomain,
      signupEmail: signupEmail(row),
      signedUpAt: row.createdAt.toISOString(),
      ...attributionOf(row),
      firstWin: win,
      furthestOnboardingStep: win
        ? null
        : furthestOnboardingStep({
            emailVerified,
            clientCount: row._count.clients,
            proposalCount: row._count.proposals,
          }),
    };
  });

  const winRows = wins
    .map((row) => {
      const win = firstWinOf(row);
      if (!win) return null;
      return {
        tenantId: row.id,
        practiceName: row.name,
        subdomain: row.subdomain,
        signupEmail: signupEmail(row),
        signedUpAt: row.createdAt.toISOString(),
        ...attributionOf(row),
        firstWin: win,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const signupsWithFirstWin = signupRows.filter((row) => row.firstWin).length;

  return {
    date,
    timezone: 'UTC',
    signups: signupRows,
    firstWinsRecordedOnDate: winRows,
    summary: {
      signups: signupRows.length,
      signupsWithFirstWin,
      signupsStillOnboarding: signupRows.length - signupsWithFirstWin,
      firstWinsRecordedOnDate: winRows.length,
    },
  };
}
