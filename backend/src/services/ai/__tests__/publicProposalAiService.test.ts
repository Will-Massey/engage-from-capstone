import { computeSigningCostSummary } from '../publicProposalAiService.js';

function mockProposal(services: Array<Record<string, unknown>>, overrides: Record<string, unknown> = {}) {
  return {
    paymentFrequency: 'MONTHLY',
    total: 1200,
    vatAmount: 200,
    subtotal: 1000,
    services: services.map((s, i) => ({
      id: `svc-${i}`,
      name: s.name ?? 'Service',
      description: null,
      quantity: s.quantity ?? 1,
      unitPrice: s.unitPrice ?? 100,
      lineTotal: s.lineTotal ?? 100,
      grossTotal: s.grossTotal ?? 120,
      vatAmount: s.vatAmount ?? 20,
      billingFrequency: s.billingFrequency ?? 'MONTHLY',
      frequency: s.frequency ?? 'MONTHLY',
      isOptional: s.isOptional ?? false,
      oneOffDueDate: null,
      serviceTemplateId: null,
      serviceTemplate: null,
    })),
    ...overrides,
  } as any;
}

describe('computeSigningCostSummary', () => {
  it('uses monthly fees when services are billed monthly', () => {
    const summary = computeSigningCostSummary(
      mockProposal([
        { name: 'Bookkeeping', grossTotal: 600, vatAmount: 100, billingFrequency: 'MONTHLY' },
        { name: 'Payroll', grossTotal: 540, vatAmount: 90, billingFrequency: 'MONTHLY' },
      ])
    );
    expect(summary.label).toBe('Monthly fees');
    expect(summary.amount).toBe(1140);
    expect(summary.periodPhrase).toBe('per month');
  });

  it('uses annual fees when services are billed annually', () => {
    const summary = computeSigningCostSummary(
      mockProposal([
        { name: 'Accounts', grossTotal: 960, vatAmount: 160, billingFrequency: 'ANNUALLY' },
      ])
    );
    expect(summary.label).toBe('Annual fees');
    expect(summary.amount).toBe(960);
    expect(summary.periodPhrase).toBe('per year');
  });

  it('uses one-off fees for single one-time services', () => {
    const summary = computeSigningCostSummary(
      mockProposal([
        { name: 'Setup', grossTotal: 300, vatAmount: 50, billingFrequency: 'ONE_TIME' },
      ])
    );
    expect(summary.label).toBe('One-off fees');
    expect(summary.amount).toBe(300);
    expect(summary.periodPhrase).toBe('in total');
  });
});