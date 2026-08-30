import type { CreatePricingRulePayload } from '../../types/services';

export const PRICING_FORMULA_PRESETS: CreatePricingRulePayload[] = [
  {
    name: 'Larger company +10%',
    conditionField: 'turnover',
    conditionOperator: 'GTE',
    conditionValue: 250_000,
    adjustmentType: 'PERCENTAGE',
    adjustmentValue: 10,
    priority: 10,
  },
  {
    name: '10+ staff +£50',
    conditionField: 'employeeCount',
    conditionOperator: 'GTE',
    conditionValue: 10,
    adjustmentType: 'FIXED',
    adjustmentValue: 50,
    priority: 5,
  },
  {
    name: '£8 per employee',
    conditionField: 'employeeCount',
    conditionOperator: 'GTE',
    conditionValue: 1,
    adjustmentType: 'PER_EMPLOYEE',
    adjustmentValue: 8,
    priority: 1,
  },
];

export function formatConditionValue(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return String(parsed);
    } catch {
      return raw;
    }
  }
  return String(raw);
}

export function formatAdjustment(type: string, value: number): string {
  if (type === 'PERCENTAGE') return `+${value}%`;
  if (type === 'PER_EMPLOYEE') return `+£${value} per employee`;
  return `+£${value}`;
}
