const tenantFindUnique = jest.fn();
const userFindFirst = jest.fn();
const userFindMany = jest.fn();
const signalFindMany = jest.fn();
const signalUpdate = jest.fn();
const serviceTemplateFindMany = jest.fn();
const proposalCreate = jest.fn();
const proposalFindFirst = jest.fn();
const proposalUpdate = jest.fn();
const activityLogCreate = jest.fn();

jest.mock('../../config/database.js', () => ({
  prisma: {
    tenant: { findUnique: tenantFindUnique },
    user: { findFirst: userFindFirst, findMany: userFindMany },
    regulatorySignal: { findMany: signalFindMany, update: signalUpdate },
    serviceTemplate: { findMany: serviceTemplateFindMany },
    proposal: { create: proposalCreate, findFirst: proposalFindFirst, update: proposalUpdate },
    activityLog: { create: activityLogCreate },
  },
}));

const loggerInfo = jest.fn();
const loggerWarn = jest.fn();
const loggerError = jest.fn();
jest.mock('../../config/logger.js', () => ({
  __esModule: true,
  default: {
    info: (...args: unknown[]) => loggerInfo(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

const isAiConfigured = jest.fn();
const chatCompletion = jest.fn();
const checkAiTokenBudget = jest.fn();
jest.mock('../ai/aiClient.js', () => ({
  isAiConfigured: () => isAiConfigured(),
  chatCompletion: (...args: unknown[]) => chatCompletion(...args),
  checkAiTokenBudget: (...args: unknown[]) => checkAiTokenBudget(...args),
  tokenMetaFromUsage: (usage?: Record<string, number>) => ({ ...(usage || {}) }),
}));

const logAiUsage = jest.fn();
jest.mock('../ai/proposalAiService.js', () => ({
  logAiUsage: (...args: unknown[]) => logAiUsage(...args),
  UK_SYSTEM: 'UK persona — never invent statutory deadlines or fees.',
}));

const findRenewalCandidates = jest.fn();
const createRenewalDraft = jest.fn();
jest.mock('../renewalProposalService.js', () => ({
  findRenewalCandidates: (...args: unknown[]) => findRenewalCandidates(...args),
  createRenewalDraft: (...args: unknown[]) => createRenewalDraft(...args),
}));

const getEngagedServiceNames = jest.fn();
jest.mock('../engagedServices.js', () => ({
  getEngagedServiceNames: (...args: unknown[]) => getEngagedServiceNames(...args),
}));

const resolveProposalTerms = jest.fn();
jest.mock('../proposalTermsService.js', () => ({
  resolveProposalTerms: (...args: unknown[]) => resolveProposalTerms(...args),
}));

import { ApiError } from '../../middleware/errorHandler.js';
import { buildProposalServiceRecord, calculateHeaderTotals } from '../../utils/proposalPricing.js';
import {
  buildFallbackCoverLetter,
  clientAlreadyCovered,
  matchTemplatesForSignal,
  runClaraDraftingForTenant,
} from '../claraAgenticService.js';

const NOW = new Date('2026-07-12T02:00:00.000Z');

const ENABLED_SETTINGS = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ clara: { agenticDraftingEnabled: true, ...overrides } });

const VAT_TEMPLATE = {
  id: 'tpl-vat',
  name: 'VAT Return Preparation',
  description: 'Quarterly VAT returns',
  priceAmount: 60,
  basePrice: 0,
  billingCycle: 'MONTHLY',
  defaultFrequency: 'MONTHLY',
  category: 'COMPLIANCE',
  tags: '',
};

const PAYROLL_TEMPLATE = {
  ...VAT_TEMPLATE,
  id: 'tpl-payroll',
  name: 'Monthly Payroll Processing',
  description: 'RTI payroll',
  priceAmount: 45,
};

function vatSignal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sig-1',
    clientId: 'c1',
    ruleId: 'vat-registration-required',
    family: 'vat',
    severity: 'action_required',
    title: 'VAT registration likely required',
    detail: 'Turnover exceeds the £90,000 threshold.',
    metadata: JSON.stringify({ category: 'vat', threshold: 90000 }),
    status: 'OPEN',
    client: { id: 'c1', name: 'Acme Ltd' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  tenantFindUnique.mockResolvedValue({ settings: ENABLED_SETTINGS() });
  userFindFirst.mockResolvedValue(null);
  userFindMany.mockResolvedValue([{ id: 'owner-1', role: 'ADMIN' }]);
  signalFindMany.mockResolvedValue([]);
  signalUpdate.mockResolvedValue({});
  serviceTemplateFindMany.mockResolvedValue([VAT_TEMPLATE, PAYROLL_TEMPLATE]);
  proposalCreate.mockResolvedValue({ id: 'prop-1', title: 'VAT services — Acme Ltd' });
  proposalFindFirst.mockResolvedValue(null);
  proposalUpdate.mockResolvedValue({});
  activityLogCreate.mockResolvedValue({});
  isAiConfigured.mockReturnValue(false);
  checkAiTokenBudget.mockResolvedValue({ withinBudget: true });
  findRenewalCandidates.mockResolvedValue([]);
  resolveProposalTerms.mockResolvedValue('STANDARD TERMS');
});

describe('runClaraDraftingForTenant — opt-in gate', () => {
  it('no-ops (no reads beyond settings, no writes) when the tenant has not opted in', async () => {
    tenantFindUnique.mockResolvedValue({ settings: '{}' });

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary).toEqual({
      tenantId: 't1',
      enabled: false,
      signalDrafts: 0,
      renewalDrafts: 0,
      skipped: 0,
      errors: 0,
    });
    expect(signalFindMany).not.toHaveBeenCalled();
    expect(findRenewalCandidates).not.toHaveBeenCalled();
    expect(proposalCreate).not.toHaveBeenCalled();
    expect(proposalUpdate).not.toHaveBeenCalled();
    expect(signalUpdate).not.toHaveBeenCalled();
    expect(activityLogCreate).not.toHaveBeenCalled();
  });

  it('skips the tenant with a warning when no active ADMIN/PARTNER/MD exists', async () => {
    userFindMany.mockResolvedValue([]);

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.signalDrafts).toBe(0);
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('no active ADMIN/PARTNER/MD'));
    expect(signalFindMany).not.toHaveBeenCalled();
    expect(proposalCreate).not.toHaveBeenCalled();
  });

  it('prefers the configured draftOwnerUserId, falling back to role priority', async () => {
    tenantFindUnique.mockResolvedValue({
      settings: ENABLED_SETTINGS({ draftOwnerUserId: 'custom-owner' }),
    });
    userFindFirst.mockResolvedValue({ id: 'custom-owner' });
    signalFindMany.mockResolvedValue([vatSignal()]);
    getEngagedServiceNames.mockResolvedValue([]);

    await runClaraDraftingForTenant('t1', NOW);

    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'custom-owner', tenantId: 't1', isActive: true },
      })
    );
    expect(proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdById: 'custom-owner' }) })
    );
  });

  it('resolves owner by ADMIN → PARTNER → MD priority', async () => {
    userFindMany.mockResolvedValue([
      { id: 'md-1', role: 'MD' },
      { id: 'partner-1', role: 'PARTNER' },
    ]);
    signalFindMany.mockResolvedValue([vatSignal()]);
    getEngagedServiceNames.mockResolvedValue([]);

    await runClaraDraftingForTenant('t1', NOW);

    expect(proposalCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdById: 'partner-1' }) })
    );
  });
});

describe('family → template matching (pure)', () => {
  const templates = [
    { id: '1', name: 'VAT Return Preparation' }, // COMPLIANCE-categorised in real catalogs
    { id: '2', name: 'Monthly Payroll Processing' },
    { id: '3', name: 'MTD ITSA Quarterly Return' },
    { id: '4', name: 'Confirmation Statement (CS01)' },
    { id: '5', name: 'Annual Accounts Preparation' },
    { id: '6', name: 'Management Reporting' },
  ];

  it('matches each family against realistic template names regardless of category', () => {
    expect(
      matchTemplatesForSignal(
        { family: 'vat', ruleId: 'vat-registration-required' },
        templates
      ).map((t) => t.id)
    ).toEqual(['1']);
    expect(
      matchTemplatesForSignal(
        { family: 'payroll', ruleId: 'payroll-no-service-gap' },
        templates
      ).map((t) => t.id)
    ).toEqual(['2']);
    expect(
      matchTemplatesForSignal(
        { family: 'mtd_itsa', ruleId: 'mtd-itsa-2026-mandatory' },
        templates
      ).map((t) => t.id)
    ).toEqual(['3']);
    expect(
      matchTemplatesForSignal(
        { family: 'filing_deadlines', ruleId: 'filing-confirmation-statement-gap' },
        templates
      ).map((t) => t.id)
    ).toEqual(['4']);
    expect(
      matchTemplatesForSignal(
        { family: 'filing_deadlines', ruleId: 'filing-accounts-gap' },
        templates
      ).map((t) => t.id)
    ).toEqual(['5']);
    expect(
      matchTemplatesForSignal(
        { family: 'filing_deadlines', ruleId: 'filing-vat-return-gap' },
        templates
      ).map((t) => t.id)
    ).toEqual(['1']);
  });

  it('caps at 2 templates and prefers exact library names', () => {
    const many = [
      { id: 'a', name: 'VAT health check' },
      { id: 'b', name: 'VAT registration support' },
      { id: 'c', name: 'VAT Return Preparation' },
    ];
    const matched = matchTemplatesForSignal(
      { family: 'vat', ruleId: 'vat-registration-required' },
      many
    );
    expect(matched).toHaveLength(2);
    expect(matched[0].id).toBe('c'); // exact library name wins
    expect(matched[1].id).toBe('a'); // then stable catalog order
  });

  it('returns no matches for an unknown family', () => {
    expect(matchTemplatesForSignal({ family: 'bogus', ruleId: 'x' }, templates)).toEqual([]);
  });

  it('clientAlreadyCovered mirrors the coverage matchers per family/rule', () => {
    const engaged = [{ name: 'Quarterly VAT Returns', category: 'COMPLIANCE' }];
    expect(
      clientAlreadyCovered({ family: 'vat', ruleId: 'vat-registration-required' }, engaged)
    ).toBe(true);
    expect(
      clientAlreadyCovered({ family: 'payroll', ruleId: 'payroll-no-service-gap' }, engaged)
    ).toBe(false);
    expect(
      clientAlreadyCovered({ family: 'payroll', ruleId: 'payroll-no-service-gap' }, [
        { name: 'Monthly Payroll Processing', category: 'COMPLIANCE' },
      ])
    ).toBe(true);
    expect(
      clientAlreadyCovered({ family: 'mtd_itsa', ruleId: 'mtd-itsa-2026-mandatory' }, [
        { name: 'MTD ITSA Quarterly Return', category: null },
      ])
    ).toBe(true);
    expect(
      clientAlreadyCovered(
        { family: 'filing_deadlines', ruleId: 'filing-confirmation-statement-gap' },
        [{ name: 'Company Secretarial Support', category: null }]
      )
    ).toBe(true);
  });
});

describe('regulatory-signal drafting', () => {
  it('creates a DRAFT+PENDING proposal with engine-priced totals, actions the signal, and logs', async () => {
    signalFindMany.mockResolvedValue([vatSignal()]);
    getEngagedServiceNames.mockResolvedValue([]);

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.signalDrafts).toBe(1);
    expect(summary.errors).toBe(0);

    // Only OPEN warning/action_required signals in enabled families are drafted
    expect(signalFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          status: 'OPEN',
          severity: { in: ['warning', 'action_required'] },
          family: { in: ['vat', 'mtd_itsa', 'filing_deadlines', 'payroll'] },
        }),
        orderBy: { firstRaisedAt: 'asc' },
      })
    );

    // Prices come from the pricing engine on the template's own price — assert
    // the calculateHeaderTotals output is persisted verbatim (pence invariants).
    const expectedService = buildProposalServiceRecord(
      { serviceId: VAT_TEMPLATE.id },
      VAT_TEMPLATE as never,
      () => null
    );
    const expectedTotals = calculateHeaderTotals([expectedService]);
    expect(expectedTotals.totalPence).toBe(
      expectedTotals.subtotalPence + expectedTotals.vatAmountPence
    );

    const createArg = proposalCreate.mock.calls[0][0].data;
    expect(createArg).toMatchObject({
      tenantId: 't1',
      clientId: 'c1',
      createdById: 'owner-1',
      status: 'DRAFT',
      approvalStatus: 'PENDING',
      submittedForApprovalAt: NOW,
      title: 'VAT services — Acme Ltd',
      subtotal: expectedTotals.subtotal,
      vatAmount: expectedTotals.vatAmount,
      total: expectedTotals.total,
      subtotalPence: expectedTotals.subtotalPence,
      vatAmountPence: expectedTotals.vatAmountPence,
      totalPence: expectedTotals.totalPence,
      terms: 'STANDARD TERMS',
    });
    expect(createArg.services.create).toEqual([expectedService]);
    expect(createArg.notes).toContain('vat-registration-required');
    expect(createArg.notes).toContain('VAT registration likely required');

    // Signal transitions OPEN → ACTIONED with the proposal pointer MERGED into
    // existing metadata (rule context preserved, not clobbered).
    expect(signalUpdate).toHaveBeenCalledTimes(1);
    const signalUpdateArg = signalUpdate.mock.calls[0][0];
    expect(signalUpdateArg.where).toEqual({ id: 'sig-1' });
    expect(signalUpdateArg.data.status).toBe('ACTIONED');
    expect(JSON.parse(signalUpdateArg.data.metadata)).toMatchObject({
      category: 'vat',
      threshold: 90000,
      proposalId: 'prop-1',
    });

    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CLARA_DRAFT_CREATED',
        entityType: 'PROPOSAL',
        entityId: 'prop-1',
        metadata: JSON.stringify({
          signalId: 'sig-1',
          ruleId: 'vat-registration-required',
          proposalId: 'prop-1',
          aiCoverLetter: false,
        }),
      }),
    });
  });

  it('skips (and logs) signals with no matching template, leaving them OPEN', async () => {
    signalFindMany.mockResolvedValue([
      vatSignal({ id: 'sig-x', ruleId: 'mtd-itsa-2026-mandatory', family: 'mtd_itsa' }),
    ]);
    serviceTemplateFindMany.mockResolvedValue([PAYROLL_TEMPLATE]);
    getEngagedServiceNames.mockResolvedValue([]);

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.signalDrafts).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(loggerInfo).toHaveBeenCalledWith(expect.stringContaining('no active service template'));
    expect(proposalCreate).not.toHaveBeenCalled();
    expect(signalUpdate).not.toHaveBeenCalled();
  });

  it('skips (and logs) when the client already engages a covering service', async () => {
    signalFindMany.mockResolvedValue([vatSignal()]);
    getEngagedServiceNames.mockResolvedValue([{ name: 'VAT Returns', category: 'COMPLIANCE' }]);

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.skipped).toBe(1);
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('already engages a covering service')
    );
    expect(proposalCreate).not.toHaveBeenCalled();
    expect(signalUpdate).not.toHaveBeenCalled();
  });

  it('respects maxDraftsPerRun across signals and renewals', async () => {
    tenantFindUnique.mockResolvedValue({ settings: ENABLED_SETTINGS({ maxDraftsPerRun: 1 }) });
    signalFindMany.mockResolvedValue([vatSignal(), vatSignal({ id: 'sig-2', clientId: 'c2' })]);
    getEngagedServiceNames.mockResolvedValue([]);

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.signalDrafts).toBe(1);
    expect(proposalCreate).toHaveBeenCalledTimes(1);
    // Budget exhausted → renewal phase never starts
    expect(findRenewalCandidates).not.toHaveBeenCalled();
  });

  it('continues the run when one draft fails (per-draft error isolation)', async () => {
    signalFindMany.mockResolvedValue([vatSignal(), vatSignal({ id: 'sig-2', clientId: 'c2' })]);
    getEngagedServiceNames.mockResolvedValue([]);
    proposalCreate
      .mockRejectedValueOnce(new Error('db write failed'))
      .mockResolvedValueOnce({ id: 'prop-2', title: 'VAT services — Acme Ltd' });

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.errors).toBe(1);
    expect(summary.signalDrafts).toBe(1);
    expect(loggerError).toHaveBeenCalled();
    // Failed draft never actions its signal — it stays OPEN for the next run
    expect(signalUpdate).toHaveBeenCalledTimes(1);
    expect(signalUpdate.mock.calls[0][0].data.status).toBe('ACTIONED');
  });

  it('honours draftRegulatoryFamilies (empty list drafts nothing from signals)', async () => {
    tenantFindUnique.mockResolvedValue({
      settings: ENABLED_SETTINGS({ draftRegulatoryFamilies: [] }),
    });

    await runClaraDraftingForTenant('t1', NOW);

    expect(signalFindMany).not.toHaveBeenCalled();
    expect(proposalCreate).not.toHaveBeenCalled();
  });
});

describe('AI narrative discipline', () => {
  it('uses the LLM only when configured AND within budget, consuming the cover letter ONLY', async () => {
    signalFindMany.mockResolvedValue([vatSignal()]);
    getEngagedServiceNames.mockResolvedValue([]);
    isAiConfigured.mockReturnValue(true);
    checkAiTokenBudget.mockResolvedValue({ withinBudget: true });
    chatCompletion.mockResolvedValue({
      content: 'Dear Acme, please pay £999,999 for everything.',
      usage: { prompt_tokens: 120, completion_tokens: 210, total_tokens: 330 },
    });

    await runClaraDraftingForTenant('t1', NOW);

    expect(checkAiTokenBudget).toHaveBeenCalledWith('t1');
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const [messages, options] = chatCompletion.mock.calls[0];
    expect(options).toEqual({ temperature: 0.5, maxTokens: 700 });
    expect(messages[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('never invent statutory deadlines or fees'),
    });
    // The prompt carries the signal + engine-priced lines as fixed facts
    expect(messages[1].content).toContain('VAT registration likely required');
    expect(messages[1].content).toContain('VAT Return Preparation: £60.00 (MONTHLY)');

    const createArg = proposalCreate.mock.calls[0][0].data;
    // Narrative only: the response is the cover letter and nothing else…
    expect(createArg.coverLetter).toBe('Dear Acme, please pay £999,999 for everything.');
    // …prices and totals still come from the pricing engine, not the LLM
    const expectedTotals = calculateHeaderTotals([
      buildProposalServiceRecord({ serviceId: VAT_TEMPLATE.id }, VAT_TEMPLATE as never, () => null),
    ]);
    expect(createArg.total).toBe(expectedTotals.total);
    expect(createArg.totalPence).toBe(expectedTotals.totalPence);
    expect(createArg.services.create[0].displayPrice).toBe(60);

    expect(logAiUsage).toHaveBeenCalledWith('t1', 'owner-1', 'clara_agentic_draft', {
      signalId: 'sig-1',
      ruleId: 'vat-registration-required',
      prompt_tokens: 120,
      completion_tokens: 210,
      total_tokens: 330,
    });
    // aiCoverLetter flag recorded on the activity log
    const logMeta = JSON.parse(activityLogCreate.mock.calls[0][0].data.metadata);
    expect(logMeta.aiCoverLetter).toBe(true);
  });

  it('falls back to the deterministic letter when the budget is exhausted', async () => {
    signalFindMany.mockResolvedValue([vatSignal()]);
    getEngagedServiceNames.mockResolvedValue([]);
    isAiConfigured.mockReturnValue(true);
    checkAiTokenBudget.mockResolvedValue({ withinBudget: false });

    await runClaraDraftingForTenant('t1', NOW);

    expect(chatCompletion).not.toHaveBeenCalled();
    expect(logAiUsage).not.toHaveBeenCalled();
    const createArg = proposalCreate.mock.calls[0][0].data;
    expect(createArg.coverLetter).toContain('VAT registration likely required');
    expect(createArg.coverLetter).toContain('- VAT Return Preparation');
  });

  it('falls back when AI is not configured or the call fails', async () => {
    signalFindMany.mockResolvedValue([vatSignal(), vatSignal({ id: 'sig-2', clientId: 'c2' })]);
    getEngagedServiceNames.mockResolvedValue([]);
    // First signal: not configured; second: configured but the provider errors
    isAiConfigured.mockReturnValueOnce(false).mockReturnValue(true);
    chatCompletion.mockRejectedValue(new Error('provider down'));

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.signalDrafts).toBe(2);
    expect(summary.errors).toBe(0);
    for (const call of proposalCreate.mock.calls) {
      expect(call[0].data.coverLetter).toContain('Dear Acme Ltd');
    }
  });

  it('deterministic fallback letter restates the trigger and services', () => {
    const letter = buildFallbackCoverLetter(
      'Acme Ltd',
      { title: 'VAT registration likely required', detail: 'Turnover exceeds the threshold.' },
      [{ name: 'VAT Return Preparation' }]
    );
    expect(letter).toContain('Dear Acme Ltd');
    expect(letter).toContain('VAT registration likely required');
    expect(letter).toContain('- VAT Return Preparation');
  });
});

describe('renewal drafting', () => {
  const CANDIDATE = {
    clientId: 'c9',
    clientName: 'Renewal Co',
    proposalId: 'orig-1',
    hasPendingRenewal: false,
  };

  beforeEach(() => {
    tenantFindUnique.mockResolvedValue({
      settings: ENABLED_SETTINGS({ renewalUpliftPercent: 5 }),
    });
    proposalFindFirst.mockResolvedValue({ id: 'orig-1', createdById: 'creator-7' });
    createRenewalDraft.mockResolvedValue({ id: 'ren-1', title: 'Annual Accounts (Renewal)' });
  });

  it('drafts renewals with archiveOriginal:false, queues them PENDING, and logs', async () => {
    findRenewalCandidates.mockResolvedValue([CANDIDATE]);

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.renewalDrafts).toBe(1);
    // Attributed to the ORIGINAL proposal's creator, never a system user
    expect(createRenewalDraft).toHaveBeenCalledWith('t1', 'creator-7', 'orig-1', {
      upliftPercent: 5,
      useAiCoverLetter: false, // useAiCoverLetter && isAiConfigured() — AI off here
      bulkRenewal: true,
      archiveOriginal: false,
    });
    expect(proposalUpdate).toHaveBeenCalledWith({
      where: { id: 'ren-1' },
      data: { approvalStatus: 'PENDING', submittedForApprovalAt: NOW },
    });
    expect(activityLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CLARA_DRAFT_CREATED',
        entityId: 'ren-1',
        userId: 'creator-7',
        metadata: JSON.stringify({
          originalProposalId: 'orig-1',
          proposalId: 'ren-1',
          renewal: true,
        }),
      }),
    });
  });

  it('passes useAiCoverLetter through only when AI is configured', async () => {
    isAiConfigured.mockReturnValue(true);
    findRenewalCandidates.mockResolvedValue([CANDIDATE]);

    await runClaraDraftingForTenant('t1', NOW);

    expect(createRenewalDraft).toHaveBeenCalledWith(
      't1',
      'creator-7',
      'orig-1',
      expect.objectContaining({ useAiCoverLetter: true })
    );
  });

  it('skips candidates that already have a pending renewal', async () => {
    findRenewalCandidates.mockResolvedValue([{ ...CANDIDATE, hasPendingRenewal: true }]);

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.renewalDrafts).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(createRenewalDraft).not.toHaveBeenCalled();
  });

  it('treats a RENEWAL_EXISTS race as a skip, not an error', async () => {
    findRenewalCandidates.mockResolvedValue([CANDIDATE]);
    createRenewalDraft.mockRejectedValue(
      new ApiError('RENEWAL_EXISTS', 'A renewal draft already exists', 409)
    );

    const summary = await runClaraDraftingForTenant('t1', NOW);

    expect(summary.renewalDrafts).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it('does not run the renewal phase when draftRenewals is off', async () => {
    tenantFindUnique.mockResolvedValue({ settings: ENABLED_SETTINGS({ draftRenewals: false }) });

    await runClaraDraftingForTenant('t1', NOW);

    expect(findRenewalCandidates).not.toHaveBeenCalled();
  });
});
