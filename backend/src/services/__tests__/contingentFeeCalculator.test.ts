import { calculateContingentFee } from '../contingentFeeCalculator.js';

describe('contingentFeeCalculator', () => {
  it('calculates fee as percent of estimated saving', () => {
    const result = calculateContingentFee({
      estimatedSavingGbp: 60_000,
      percentOfSaving: 25,
    });

    expect(result.feeGbp).toBe(15_000);
    expect(result.explanation).toContain('£15,000');
    expect(result.explanation).toContain('25%');
  });

  it('applies cap when raw fee exceeds cap', () => {
    const result = calculateContingentFee({
      estimatedSavingGbp: 100_000,
      percentOfSaving: 30,
      capGbp: 20_000,
    });

    expect(result.feeGbp).toBe(20_000);
    expect(result.explanation).toContain('capped');
  });

  it('applies floor when raw fee is below floor', () => {
    const result = calculateContingentFee({
      estimatedSavingGbp: 5_000,
      percentOfSaving: 20,
      floorGbp: 2_500,
    });

    expect(result.feeGbp).toBe(2_500);
    expect(result.explanation).toContain('minimum fee');
  });

  it('applies cap then floor in order', () => {
    const result = calculateContingentFee({
      estimatedSavingGbp: 10_000,
      percentOfSaving: 10,
      capGbp: 5_000,
      floorGbp: 1_000,
    });

    expect(result.feeGbp).toBe(1_000);
  });

  it('rejects invalid inputs', () => {
    expect(() =>
      calculateContingentFee({ estimatedSavingGbp: 0, percentOfSaving: 25 })
    ).toThrow();
    expect(() =>
      calculateContingentFee({ estimatedSavingGbp: 10_000, percentOfSaving: 0 })
    ).toThrow();
    expect(() =>
      calculateContingentFee({
        estimatedSavingGbp: 10_000,
        percentOfSaving: 25,
        capGbp: 1_000,
        floorGbp: 2_000,
      })
    ).toThrow();
  });
});