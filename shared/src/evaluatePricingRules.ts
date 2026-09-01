/**
 * Apply catalogue PricingRule rows to a base fee using the selected client.
 * Accepts the Prisma-shaped rule (conditionField / adjustmentValue).
 */

export type StoredPricingRule = {
  name?: string;
  conditionField: string;
  conditionOperator: string;
  conditionValue: unknown;
  adjustmentType: string;
  adjustmentValue: number;
  isActive?: boolean;
  priority?: number;
};

export type PricingClientContext = {
  turnover?: number | null;
  employeeCount?: number | null;
};

export type PricingRuleEvaluation = {
  price: number;
  applied: string[];
};

function parseConditionValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    return JSON.parse(trimmed);
  } catch {
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) ? asNumber : trimmed;
  }
}

function clientFieldValue(client: PricingClientContext, field: string): number | null {
  const key = field.trim().toLowerCase();
  if (key === 'turnover' || key === 'annualturnover' || key === 'turnoverband') {
    return typeof client.turnover === 'number' && Number.isFinite(client.turnover)
      ? client.turnover
      : null;
  }
  if (key === 'employeecount' || key === 'employees' || key === 'staff') {
    return typeof client.employeeCount === 'number' && Number.isFinite(client.employeeCount)
      ? client.employeeCount
      : null;
  }
  return null;
}

function matches(actual: number, operator: string, expected: unknown): boolean {
  if (operator === 'IN') {
    const list = Array.isArray(expected) ? expected : [expected];
    return list.some((item) => Number(item) === actual);
  }
  const target = Number(expected);
  if (!Number.isFinite(target)) return false;
  switch (operator) {
    case 'EQ':
      return actual === target;
    case 'GT':
      return actual > target;
    case 'LT':
      return actual < target;
    case 'GTE':
      return actual >= target;
    case 'LTE':
      return actual <= target;
    default:
      return false;
  }
}

function applyAdjustment(
  price: number,
  rule: StoredPricingRule,
  client: PricingClientContext
): number {
  const amount = Number(rule.adjustmentValue) || 0;
  const type = String(rule.adjustmentType || 'FIXED').toUpperCase();
  if (type === 'PERCENTAGE') {
    return Math.round(price * (1 + amount / 100));
  }
  if (type === 'PER_EMPLOYEE') {
    const staff = client.employeeCount && client.employeeCount > 0 ? client.employeeCount : 0;
    return Math.round(price + amount * staff);
  }
  return Math.round(price + amount);
}

export function evaluatePricingRules(
  basePrice: number,
  client: PricingClientContext,
  rules: StoredPricingRule[]
): PricingRuleEvaluation {
  const active = (rules || [])
    .filter((r) => r && r.isActive !== false)
    .slice()
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  let price = Math.round(Number(basePrice) || 0);
  const applied: string[] = [];

  for (const rule of active) {
    const actual = clientFieldValue(client, rule.conditionField);
    if (actual == null) continue;
    if (
      !matches(
        actual,
        String(rule.conditionOperator || 'GTE'),
        parseConditionValue(rule.conditionValue)
      )
    ) {
      continue;
    }
    price = applyAdjustment(price, rule, client);
    applied.push(
      rule.name || `${rule.conditionField} ${rule.conditionOperator} ${rule.conditionValue}`
    );
  }

  return { price: Math.max(0, price), applied };
}
