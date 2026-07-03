import { buildProposalServiceRecord } from '../src/utils/proposalPricing.js';

const parseOneOff = () => null;

describe('proposal line snapshots', () => {
  const catalogue = {
    id: 'catalogue-1',
    name: 'Live catalogue name',
    description: 'Live catalogue description',
    priceAmount: 500,
    billingCycle: 'MONTHLY',
  };

  it('preserves snapshot name, description, and price over live catalogue', () => {
    const line = buildProposalServiceRecord(
      {
        serviceId: catalogue.id,
        name: 'Frozen proposal name',
        description: 'Frozen description',
        displayPrice: 1200,
        billingFrequency: 'MONTHLY',
        quantity: 1,
      },
      catalogue,
      parseOneOff
    );

    expect(line.name).toBe('Frozen proposal name');
    expect(line.description).toBe('Frozen description');
    expect(line.displayPrice).toBe(1200);
    expect(line.serviceTemplateId).toBe('catalogue-1');
  });

  it('does not link invalid catalogue ids when template is missing', () => {
    const line = buildProposalServiceRecord(
      {
        serviceId: 'not-a-catalogue-id',
        name: 'Custom line',
        displayPrice: 99,
        billingFrequency: 'MONTHLY',
      },
      undefined,
      parseOneOff
    );

    expect(line.serviceTemplateId).toBeNull();
    expect(line.name).toBe('Custom line');
    expect(line.displayPrice).toBe(99);
  });
});