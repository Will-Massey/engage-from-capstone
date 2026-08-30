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

  it('skips blank names', () => {
    expect(formatProposalLetterSeed('X', [{ name: '  ' }])).toEqual({
      proposalReference: 'X',
      services: '',
      fees: '',
    });
  });
});
