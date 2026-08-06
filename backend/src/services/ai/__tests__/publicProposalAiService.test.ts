import { computeSigningCostSummary, formatSigningCostPhrase } from '../publicProposalAiService.js';

function mockProposal(
  services: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {}
) {
  return {
    paymentFrequency: 'MONTHLY',
    totalPence: 120000,
    vatAmountPence: 20000,
    subtotalPence: 100000,
    services: services.map((s, i) => ({
      id: `svc-${i}`,
      name: s.name ?? 'Service',
      description: null,
      quantity: s.quantity ?? 1,
      unitPricePence: s.unitPricePence ?? 10000,
      lineTotalPence: s.lineTotalPence ?? 10000,
      grossTotalPence: s.grossTotalPence ?? 12000,
      vatAmountPence: s.vatAmountPence ?? 2000,
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
  it('uses monthly recurring when services are billed monthly', () => {
    const summary = computeSigningCostSummary(
      mockProposal([
        {
          name: 'Bookkeeping',
          grossTotalPence: 60000,
          vatAmountPence: 10000,
          billingFrequency: 'MONTHLY',
        },
        {
          name: 'Payroll',
          grossTotalPence: 54000,
          vatAmountPence: 9000,
          billingFrequency: 'MONTHLY',
        },
      ])
    );
    expect(summary.dueToday).toBeNull();
    expect(summary.recurring?.amount).toBe(1140);
    expect(summary.recurring?.periodPhrase).toBe('per month');
  });

  it('splits due today and monthly recurring fees', () => {
    const summary = computeSigningCostSummary(
      mockProposal([
        {
          name: 'Setup',
          grossTotalPence: 30000,
          vatAmountPence: 5000,
          billingFrequency: 'ONE_TIME',
        },
        {
          name: 'Bookkeeping',
          grossTotalPence: 60000,
          vatAmountPence: 10000,
          billingFrequency: 'MONTHLY',
        },
      ])
    );
    expect(summary.dueToday?.amount).toBe(300);
    expect(summary.recurring?.amount).toBe(600);
    expect(formatSigningCostPhrase(summary)).toMatch(/Due today/i);
    expect(formatSigningCostPhrase(summary)).toMatch(/Monthly recurring fee/i);
  });

  it('uses annual recurring when services are billed annually', () => {
    const summary = computeSigningCostSummary(
      mockProposal([
        {
          name: 'Accounts',
          grossTotalPence: 96000,
          vatAmountPence: 16000,
          billingFrequency: 'ANNUALLY',
        },
      ])
    );
    expect(summary.recurring?.amount).toBe(960);
    expect(summary.recurring?.periodPhrase).toBe('per year');
  });

  it('uses due today only for one-off proposals', () => {
    const summary = computeSigningCostSummary(
      mockProposal([
        {
          name: 'Setup',
          grossTotalPence: 30000,
          vatAmountPence: 5000,
          billingFrequency: 'ONE_TIME',
        },
      ])
    );
    expect(summary.dueToday?.amount).toBe(300);
    expect(summary.recurring).toBeNull();
  });
});
