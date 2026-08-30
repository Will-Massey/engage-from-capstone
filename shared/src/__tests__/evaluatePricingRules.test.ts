import { evaluatePricingRules } from '../evaluatePricingRules';

describe('evaluatePricingRules', () => {
  const base = 100;

  it('applies a percentage uplift when turnover meets the band', () => {
    const { price, applied } = evaluatePricingRules(base, { turnover: 300_000 }, [
      {
        name: 'Larger company +10%',
        conditionField: 'turnover',
        conditionOperator: 'GTE',
        conditionValue: 250_000,
        adjustmentType: 'PERCENTAGE',
        adjustmentValue: 10,
      },
    ]);
    expect(price).toBe(110);
    expect(applied).toEqual(['Larger company +10%']);
  });

  it('skips rules when the client field is missing', () => {
    const { price, applied } = evaluatePricingRules(base, {}, [
      {
        name: 'Needs turnover',
        conditionField: 'turnover',
        conditionOperator: 'GTE',
        conditionValue: 1,
        adjustmentType: 'FIXED',
        adjustmentValue: 50,
      },
    ]);
    expect(price).toBe(100);
    expect(applied).toHaveLength(0);
  });

  it('adds a fixed amount per employee', () => {
    const { price } = evaluatePricingRules(base, { employeeCount: 5 }, [
      {
        name: '£8 / employee',
        conditionField: 'employeeCount',
        conditionOperator: 'GTE',
        conditionValue: 1,
        adjustmentType: 'PER_EMPLOYEE',
        adjustmentValue: 8,
      },
    ]);
    expect(price).toBe(140);
  });

  it('parses JSON-string condition values and honours priority', () => {
    const { price, applied } = evaluatePricingRules(base, { turnover: 80_000 }, [
      {
        name: 'Low priority',
        conditionField: 'turnover',
        conditionOperator: 'GTE',
        conditionValue: '1',
        adjustmentType: 'FIXED',
        adjustmentValue: 5,
        priority: 1,
      },
      {
        name: 'High priority first',
        conditionField: 'turnover',
        conditionOperator: 'GTE',
        conditionValue: '50000',
        adjustmentType: 'PERCENTAGE',
        adjustmentValue: 20,
        priority: 10,
      },
    ]);
    expect(price).toBe(125);
    expect(applied[0]).toBe('High priority first');
  });
});
