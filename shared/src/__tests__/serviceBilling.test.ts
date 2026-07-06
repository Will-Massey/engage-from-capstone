import { resolveCatalogBillingCycle } from '../serviceBilling';

describe('resolveCatalogBillingCycle', () => {
  it('honours priceDisplayMode ONE_TIME after data migration', () => {
    expect(
      resolveCatalogBillingCycle({
        billingCycle: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        priceDisplayMode: 'ONE_TIME',
      })
    ).toBe('ONE_TIME');
  });

  it('normalises ONE_OFF to ONE_TIME', () => {
    expect(
      resolveCatalogBillingCycle({
        billingCycle: 'ONE_OFF',
        priceDisplayMode: 'PER_MONTH',
      })
    ).toBe('ONE_TIME');
  });
});
