import { formatProposalLetterSeed } from '../letterProposalSeed.js';

describe('formatProposalLetterSeed', () => {
  it('lists service names and fee lines from the last accepted proposal', () => {
    const seed = formatProposalLetterSeed('ENG-104', [
      { name: 'Bookkeeping', billingFrequency: 'MONTHLY', lineTotalPence: 12000 },
      { name: 'Year-end accounts', billingFrequency: 'ANNUAL', lineTotalPence: 85000 },
    ]);
    expect(seed.proposalReference).toBe('ENG-104');
    expect(seed.services).toBe('Bookkeeping\nYear-end accounts');
    expect(seed.fees).toContain('Bookkeeping: £120.00 / month');
    expect(seed.fees).toContain('Year-end accounts: £850.00 / year');
  });

  it('labels an hourly line as hourly without turning the total into a per-hour rate', () => {
    const seed = formatProposalLetterSeed('ENG-9', [
      { name: 'Advisory', billingFrequency: 'HOURLY', lineTotalPence: 30000 },
    ]);
    expect(seed.fees).toContain('Advisory: £300.00 hourly');
    expect(seed.fees).not.toContain('/ hour');
  });

  it('labels a monthly hourly line as an estimate of hours worked', () => {
    const seed = formatProposalLetterSeed('ENG-10', [
      {
        name: 'Bookkeeping support',
        billingFrequency: 'HOURLY',
        hourlyBillingMode: 'MONTHLY_ACTUAL',
        lineTotalPence: 30000,
      },
    ]);
    expect(seed.fees).toContain('estimated per month (hours worked)');
    expect(seed.fees).toContain('£300.00');
  });

  it('skips blank names', () => {
    expect(formatProposalLetterSeed('X', [{ name: '  ' }])).toEqual({
      proposalReference: 'X',
      services: '',
      fees: '',
    });
  });
});
