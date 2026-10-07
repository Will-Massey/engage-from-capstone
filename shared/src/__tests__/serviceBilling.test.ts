import { billingFrequencyToDisplayMode, resolveCatalogBillingCycle } from '../serviceBilling';

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

  it('resolves an hourly catalogue rate', () => {
    expect(
      resolveCatalogBillingCycle({
        billingCycle: 'HOURLY',
        defaultFrequency: 'HOURLY',
        priceDisplayMode: 'PER_HOUR',
      })
    ).toBe('HOURLY');
    expect(
      resolveCatalogBillingCycle({
        billingCycle: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        priceDisplayMode: 'PER_HOUR',
      })
    ).toBe('HOURLY');
    expect(billingFrequencyToDisplayMode('HOURLY')).toBe('PER_HOUR');
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
