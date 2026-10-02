import {
  buildFirstWinDailyReport,
  firstWinKindForProposal,
  furthestOnboardingStep,
  recordPracticeFirstWin,
  utcDayBounds,
} from '../firstWin.js';

const updateMany = jest.fn();
const findMany = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: {
      updateMany: (...args: unknown[]) => updateMany(...args),
      findMany: (...args: unknown[]) => findMany(...args),
    },
  },
}));

jest.mock('../../config/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

describe('firstWinKindForProposal', () => {
  it('treats a letter of engagement as an engagement letter', () => {
    expect(firstWinKindForProposal(JSON.stringify({ proposalType: 'loe_only' }))).toBe(
      'engagement_letter'
    );
  });

  it('treats a priced proposal as a proposal', () => {
    expect(firstWinKindForProposal('{}')).toBe('proposal');
    expect(firstWinKindForProposal(null)).toBe('proposal');
  });
});

describe('recordPracticeFirstWin', () => {
  beforeEach(() => {
    updateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it('writes the timestamp only while firstWinAt is still empty', async () => {
    const at = new Date('2026-09-28T12:00:00.000Z');
    await recordPracticeFirstWin('tenant-1', 'proposal', 'emailed', at);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'tenant-1', firstWinAt: null },
      data: { firstWinAt: at, firstWinKind: 'proposal', firstWinMethod: 'emailed' },
    });
  });

  it('does not throw when the write fails', async () => {
    updateMany.mockRejectedValue(new Error('db down'));
    await expect(
      recordPracticeFirstWin('tenant-1', 'engagement_letter', 'link_copied', new Date())
    ).resolves.toBeUndefined();
  });
});

describe('furthestOnboardingStep', () => {
  it('walks signup, verified email, client, then a saved draft', () => {
    expect(
      furthestOnboardingStep({ emailVerified: false, clientCount: 0, proposalCount: 0 }).id
    ).toBe('signed_up');
    expect(
      furthestOnboardingStep({ emailVerified: true, clientCount: 0, proposalCount: 0 }).id
    ).toBe('email_verified');
    expect(
      furthestOnboardingStep({ emailVerified: true, clientCount: 2, proposalCount: 0 }).id
    ).toBe('client_added');
    expect(
      furthestOnboardingStep({ emailVerified: false, clientCount: 0, proposalCount: 1 }).id
    ).toBe('proposal_drafted');
  });
});

describe('utcDayBounds', () => {
  it('accepts a real UTC day and rejects calendar nonsense', () => {
    const bounds = utcDayBounds('2026-09-28');
    expect(bounds?.start.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(bounds?.end.toISOString()).toBe('2026-09-29T00:00:00.000Z');
    expect(utcDayBounds('2026-02-31')).toBeNull();
    expect(utcDayBounds('28-09-2026')).toBeNull();
  });
});

describe('buildFirstWinDailyReport', () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it('lists that day’s signups, who has sent, and how far the others got', async () => {
    const signedUp = new Date('2026-09-28T08:00:00.000Z');
    const wonAt = new Date('2026-09-28T16:30:00.000Z');

    findMany.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if (args.where.createdAt) {
        return [
          {
            id: 'won',
            name: 'Won Practice',
            subdomain: 'won',
            createdAt: signedUp,
            firstWinAt: wonAt,
            firstWinKind: 'proposal',
            firstWinMethod: 'emailed',
            heardAbout: 'linkedin',
            heardAboutOther: null,
            utmSource: 'linkedin',
            utmMedium: 'social',
            utmCampaign: 'spring',
            signupReferrer: 'https://www.linkedin.com/',
            users: [
              {
                email: 'owner@won.test',
                emailVerified: signedUp,
                createdAt: signedUp,
              },
            ],
            _count: { clients: 1, proposals: 1 },
          },
          {
            id: 'stuck',
            name: 'Stuck Practice',
            subdomain: 'stuck',
            createdAt: new Date('2026-09-28T09:00:00.000Z'),
            firstWinAt: null,
            firstWinKind: null,
            firstWinMethod: null,
            users: [
              {
                email: 'owner@stuck.test',
                emailVerified: signedUp,
                createdAt: signedUp,
              },
            ],
            _count: { clients: 1, proposals: 0 },
          },
        ];
      }
      return [
        {
          id: 'earlier',
          name: 'Earlier Practice',
          subdomain: 'earlier',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          firstWinAt: wonAt,
          firstWinKind: 'engagement_letter',
          firstWinMethod: null,
          users: [
            {
              email: 'owner@earlier.test',
              emailVerified: signedUp,
              createdAt: new Date('2026-09-01T00:00:00.000Z'),
            },
          ],
        },
      ];
    });

    const report = await buildFirstWinDailyReport('2026-09-28');

    expect(report.timezone).toBe('UTC');
    expect(report.summary).toEqual({
      signups: 2,
      signupsWithFirstWin: 1,
      signupsStillOnboarding: 1,
      firstWinsRecordedOnDate: 1,
    });
    expect(report.signups[0]).toMatchObject({
      tenantId: 'won',
      signupEmail: 'owner@won.test',
      signedUpAt: signedUp.toISOString(),
      firstWin: { at: wonAt.toISOString(), kind: 'proposal', method: 'emailed' },
      furthestOnboardingStep: null,
      heardAbout: 'LinkedIn',
      utmSource: 'linkedin',
      utmMedium: 'social',
      utmCampaign: 'spring',
      referrer: 'https://www.linkedin.com/',
    });
    expect(report.signups[1].furthestOnboardingStep).toEqual({
      id: 'client_added',
      label: 'Added a client',
    });
    expect(report.firstWinsRecordedOnDate[0]).toMatchObject({
      tenantId: 'earlier',
      firstWin: { at: wonAt.toISOString(), kind: 'engagement_letter', method: null },
    });
    expect(findMany).toHaveBeenCalled();
  });
});
