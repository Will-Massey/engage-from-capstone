import { describe, expect, it } from 'vitest';
import {
  distinguishEmailSubject,
  formatEntityLabel,
  proposalSubjectLine,
} from '@shared/entityIdentity';

describe('quotes that share a contact email', () => {
  const trading = {
    name: 'Michaela Trading Ltd',
    companyNumber: '11111111',
    companyType: 'LIMITED_COMPANY',
  };
  const holdings = {
    name: 'Michaela Holdings Ltd',
    companyNumber: '22222222',
    companyType: 'LIMITED_COMPANY',
  };

  it('shows legal name, entity type and company number so the quotes are distinct', () => {
    const tradingLabel = formatEntityLabel(trading);
    const holdingsLabel = formatEntityLabel(holdings);

    expect(tradingLabel).toContain('Michaela Trading Ltd');
    expect(tradingLabel).toContain('Limited Company');
    expect(tradingLabel).toContain('No. 11111111');
    expect(holdingsLabel).toContain('Michaela Holdings Ltd');
    expect(holdingsLabel).not.toBe(tradingLabel);
    expect(tradingLabel).not.toContain('michaela@');
  });

  it('puts the legal name, company number and quote reference in the email subject', () => {
    const subject = proposalSubjectLine({
      clientName: trading.name,
      companyNumber: trading.companyNumber,
      reference: 'PROP-1042',
      title: 'Annual accounts',
    });

    expect(subject).toBe('Proposal: Michaela Trading Ltd (11111111) - PROP-1042 - Annual accounts');
    expect(subject).not.toBe(
      proposalSubjectLine({
        clientName: holdings.name,
        companyNumber: holdings.companyNumber,
        reference: 'PROP-1043',
        title: 'Annual accounts',
      })
    );
  });

  it('keeps a drafted subject but adds the reference when it would otherwise collide', () => {
    expect(
      distinguishEmailSubject(
        'Your proposal from Fortis',
        'Proposal: Michaela Trading Ltd (11111111) - PROP-1042 - Annual accounts',
        'PROP-1042',
        '11111111'
      )
    ).toBe('Your proposal from Fortis (11111111, PROP-1042)');
  });
});
