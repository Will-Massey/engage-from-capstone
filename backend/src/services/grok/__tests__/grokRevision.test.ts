import {
  buildRevisionCreateData,
  REVISION_OMITTED_FIELDS,
  type RevisionSource,
} from '../grokRevision.js';

function source(overrides: Partial<RevisionSource> = {}): RevisionSource {
  return {
    id: 'p1',
    tenantId: 't1',
    clientId: 'c1',
    title: 'Signed engagement',
    validUntil: new Date('2026-12-01T00:00:00Z'),
    contractStartDate: null,
    discountType: null,
    discountValue: 0,
    vatRate: 20,
    subtotalPence: 15000,
    discountAmountPence: 0,
    vatAmountPence: 3000,
    totalPence: 18000,
    paymentTerms: '7 days',
    paymentFrequency: 'MONTHLY',
    coverLetter: 'Hello',
    proposalSummary: null,
    terms: 'Terms',
    notes: 'Keep',
    customFields: '{}',
    engagementLetter: 'Letter',
    services: [
      {
        serviceTemplateId: 's1',
        name: 'Books',
        description: 'Monthly',
        billingFrequency: 'MONTHLY',
        priceDisplayMode: 'PER_MONTH',
        quantity: 1,
        discountPercent: 0,
        vatRate: 20,
        displayPricePence: 15000,
        unitPricePence: 15000,
        annualEquivalentPence: 180000,
        lineTotalPence: 15000,
        vatAmountPence: 3000,
        grossTotalPence: 18000,
        frequency: 'MONTHLY',
        isOptional: false,
        sortOrder: 0,
        oneOffDueDate: null,
        hourlyBillingMode: null,
      },
    ],
    ...overrides,
  };
}

describe('revision draft', () => {
  it('copies commercial content into a new draft and leaves the original byte for byte', () => {
    const original = source();
    const before = JSON.stringify(original);
    const data = buildRevisionCreateData(original, { userId: 'u1', reference: 'PROP-2' });
    expect(JSON.stringify(original)).toBe(before);
    expect(data.status).toBe('DRAFT');
    expect(data.originalProposalId).toBe('p1');
    expect(data.createdById).toBe('u1');
    const services = (data.services as { create: Array<Record<string, unknown>> }).create;
    expect(services[0].displayPricePence).toBe(15000);
    expect(services[0].name).toBe('Books');
    for (const field of REVISION_OMITTED_FIELDS) {
      if (field === 'status') continue;
      expect(data).not.toHaveProperty(field);
    }
    expect(JSON.stringify(data)).not.toMatch(/shareToken|signature|paidAt|acceptedAt/);
  });
});
