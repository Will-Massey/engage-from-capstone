/**
 * R5.1 — archiveOriginal option on createRenewalDraft + the extracted
 * archiveSupersededOriginal helper. Regression-locks the manual path (archive
 * at draft time, the default) and proves archiveOriginal:false leaves the
 * accepted original and its share link alive for Clara's deferred flow.
 */
const proposalFindFirst = jest.fn();
const proposalCreate = jest.fn();
const proposalUpdate = jest.fn();
const tenantFindUnique = jest.fn();
const activityLogCreate = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    proposal: {
      findFirst: proposalFindFirst,
      findMany: jest.fn().mockResolvedValue([]),
      create: proposalCreate,
      update: proposalUpdate,
    },
    tenant: { findUnique: tenantFindUnique },
    activityLog: { create: activityLogCreate },
    proposalTemplate: { findFirst: jest.fn(), update: jest.fn() },
  },
}));

const revokeShareableLink = jest.fn();
jest.mock('../proposalSharingService.js', () => ({
  revokeShareableLink: (...args: unknown[]) => revokeShareableLink(...args),
}));

// calculateRenewalDate lives in the reminders job, which pulls in the mailer —
// stub the module (only that helper is used here).
jest.mock('../../jobs/renewalReminders.js', () => ({
  calculateRenewalDate: (acceptedAt: Date) => {
    const d = new Date(acceptedAt);
    d.setFullYear(d.getFullYear() + 1);
    return d;
  },
}));

import { archiveSupersededOriginal, createRenewalDraft } from '../renewalProposalService.js';

const ORIGINAL = {
  id: 'orig-1',
  tenantId: 't1',
  clientId: 'c1',
  reference: 'PROP-ORIG',
  title: 'Annual Accounts',
  status: 'ACCEPTED',
  coverLetter: 'Original letter',
  terms: 'Terms',
  paymentTerms: '7 days',
  paymentFrequency: 'MONTHLY',
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  notes: '',
  shareToken: 'tok-1',
  publicAccessEnabled: true,
  renewalDate: null,
  acceptedAt: new Date('2025-08-01T00:00:00.000Z'),
  client: { id: 'c1', name: 'Acme Ltd', companyType: 'LIMITED_COMPANY' },
  services: [
    {
      name: 'Annual Accounts',
      description: null,
      quantity: 1,
      unitPrice: 100,
      discountPercent: 0,
      displayPrice: 100,
      lineTotal: 100,
      billingFrequency: 'MONTHLY',
      priceDisplayMode: 'PER_MONTH',
      frequency: 'MONTHLY',
      isOptional: false,
      serviceTemplateId: null,
      vatRate: 20,
      oneOffDueDate: null,
    },
  ],
};

const RENEWAL = { id: 'ren-1', reference: 'PROP-REN', title: 'Annual Accounts (Renewal)' };

beforeEach(() => {
  jest.clearAllMocks();
  // 1st findFirst: load the accepted original; 2nd: duplicate-renewal guard
  proposalFindFirst.mockResolvedValueOnce(ORIGINAL).mockResolvedValueOnce(null);
  tenantFindUnique.mockResolvedValue({ settings: '{}' });
  proposalCreate.mockResolvedValue(RENEWAL);
  proposalUpdate.mockResolvedValue({});
  activityLogCreate.mockResolvedValue({});
  revokeShareableLink.mockResolvedValue({});
});

describe('createRenewalDraft — archiveOriginal default (regression lock)', () => {
  it('archives + supersedes the original and revokes its share link at draft time', async () => {
    await createRenewalDraft('t1', 'u1', 'orig-1', {});

    expect(revokeShareableLink).toHaveBeenCalledWith('orig-1');
    expect(proposalUpdate).toHaveBeenCalledWith({
      where: { id: 'orig-1' },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        supersededById: 'ren-1',
        publicAccessEnabled: false,
        shareToken: null,
        shareTokenExpiry: null,
      }),
    });
    const actions = activityLogCreate.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(['PROPOSAL_RENEWAL_CREATED', 'PROPOSAL_ARCHIVED_SUPERSEDED']);
  });
});

describe('createRenewalDraft — archiveOriginal: false (Clara deferred flow)', () => {
  it('leaves the original ACCEPTED with its share link alive', async () => {
    await createRenewalDraft('t1', 'u1', 'orig-1', { archiveOriginal: false });

    expect(revokeShareableLink).not.toHaveBeenCalled();
    expect(proposalUpdate).not.toHaveBeenCalled();
    const actions = activityLogCreate.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(['PROPOSAL_RENEWAL_CREATED']);
  });

  it('still creates the renewal DRAFT itself', async () => {
    const renewal = await createRenewalDraft('t1', 'u1', 'orig-1', { archiveOriginal: false });

    expect(renewal).toBe(RENEWAL);
    expect(proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DRAFT',
          isRenewal: true,
          originalProposalId: 'orig-1',
        }),
      })
    );
  });
});

describe('archiveSupersededOriginal helper', () => {
  it('revokes the share link only when one is live, then archives and logs', async () => {
    await archiveSupersededOriginal(
      't1',
      'u1',
      { id: 'orig-1', reference: 'PROP-ORIG', shareToken: 'tok-1', publicAccessEnabled: false },
      { id: 'ren-1', reference: 'PROP-REN' }
    );

    expect(revokeShareableLink).toHaveBeenCalledWith('orig-1');
    expect(proposalUpdate).toHaveBeenCalledWith({
      where: { id: 'orig-1' },
      data: expect.objectContaining({ status: 'ARCHIVED', supersededById: 'ren-1' }),
    });
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'PROPOSAL_ARCHIVED_SUPERSEDED',
        entityId: 'orig-1',
        metadata: JSON.stringify({
          supersededById: 'ren-1',
          supersededByReference: 'PROP-REN',
        }),
      }),
    });
  });

  it('skips the share-link revocation when nothing is shared', async () => {
    await archiveSupersededOriginal(
      't1',
      'u1',
      { id: 'orig-1', reference: 'PROP-ORIG', shareToken: null, publicAccessEnabled: false },
      { id: 'ren-1', reference: 'PROP-REN' }
    );

    expect(revokeShareableLink).not.toHaveBeenCalled();
    expect(proposalUpdate).toHaveBeenCalledTimes(1);
  });
});
