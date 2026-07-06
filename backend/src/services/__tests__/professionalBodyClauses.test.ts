import { describe, expect, it } from '@jest/globals';
import {
  clauseMatchesRegulatoryBody,
  professionalBodyToClauseTag,
} from '../../utils/professionalBodyClauses.js';
import { selectClausesForServices } from '../../data/engagementClauseLibrary.js';

describe('professionalBodyClauses', () => {
  it('maps professional body codes to clause tags', () => {
    expect(professionalBodyToClauseTag('ICAEW')).toBe('_icaew');
    expect(professionalBodyToClauseTag('ATT')).toBe('_att');
    expect(professionalBodyToClauseTag('OTHER')).toBeUndefined();
  });

  it('includes universal clauses for any body', () => {
    expect(clauseMatchesRegulatoryBody(['compliance', 'tax'], 'ACCA')).toBe(true);
  });

  it('filters body-specific clauses', () => {
    expect(clauseMatchesRegulatoryBody(['_icaew', 'compliance'], 'ACCA')).toBe(false);
    expect(clauseMatchesRegulatoryBody(['_icaew', '_acca', 'compliance'], 'ACCA')).toBe(true);
  });
});

describe('selectClausesForServices regulatory filter', () => {
  it('excludes ICAEW-only scope clauses for ACCA practices', () => {
    const clauses = selectClausesForServices(
      [{ name: 'Confirmation Statement', tags: 'confirmation-statement,cs01' }],
      { professionalBody: 'ACCA' }
    );
    const ids = clauses.map((c) => c.id);
    expect(ids).not.toContain('scope-confirmation-statement');
  });

  it('includes ICAEW-only scope clauses for ICAEW practices', () => {
    const clauses = selectClausesForServices(
      [{ name: 'Confirmation Statement', tags: 'confirmation-statement,cs01' }],
      { professionalBody: 'ICAEW' }
    );
    const ids = clauses.map((c) => c.id);
    expect(ids).toContain('scope-confirmation-statement');
  });
});
