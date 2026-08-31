export type AutomationRuleRow = {
  id: string;
  trigger: string;
  action: string;
  enabled: boolean;
  source?: string;
};

export type TriggerOption = { id: string; label: string };
export type ActionOption = { id: string; label: string };

export type RuleGroup = {
  trigger: string;
  triggerLabel: string;
  rules: AutomationRuleRow[];
};

export function labelFor(options: Array<{ id: string; label: string }>, id: string): string {
  return options.find((o) => o.id === id)?.label || id;
}

/** Group rules into When → Then chains, preserving first-seen trigger order. */
export function groupRulesByTrigger(
  rules: AutomationRuleRow[],
  triggers: TriggerOption[]
): RuleGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, AutomationRuleRow[]>();
  for (const rule of rules) {
    const key = rule.trigger || 'unknown';
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(rule);
  }
  return order.map((trigger) => ({
    trigger,
    triggerLabel: labelFor(triggers, trigger),
    rules: buckets.get(trigger) || [],
  }));
}

export function ruleKey(rule: Pick<AutomationRuleRow, 'trigger' | 'action'>): string {
  return `${rule.trigger}|${rule.action}`;
}

export function mergePackRules(
  existing: AutomationRuleRow[],
  pack: { id: string; rules: Array<{ trigger: string; action: string }> },
  now = Date.now()
): { next: AutomationRuleRow[]; added: number } {
  const seen = new Set(existing.map(ruleKey));
  const additions: AutomationRuleRow[] = [];
  for (const r of pack.rules) {
    const key = ruleKey(r);
    if (seen.has(key)) continue;
    additions.push({
      id: `pack_${pack.id}_${now}_${additions.length}`,
      trigger: r.trigger,
      action: r.action,
      enabled: true,
      source: pack.id,
    });
    seen.add(key);
  }
  return { next: [...existing, ...additions], added: additions.length };
}

const LEGACY_RULES_KEY = 'engage.practice.automationRules';

/** One-shot local cache used before the builder synced to the firm. */
export function readLegacyLocalRules(): AutomationRuleRow[] {
  try {
    const raw = localStorage.getItem(LEGACY_RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r === 'object' && typeof r.id === 'string')
      .map((r) => ({
        id: String(r.id),
        trigger: String(r.trigger || ''),
        action: String(r.action || ''),
        enabled: r.enabled !== false,
        source: r.source ? String(r.source) : undefined,
      }));
  } catch {
    return [];
  }
}

export function clearLegacyLocalRules(): void {
  try {
    localStorage.removeItem(LEGACY_RULES_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Prefer firm rules; fall back to leftover browser cache so nothing is lost. */
export function resolveLoadedRules(serverRules: AutomationRuleRow[] | undefined | null): {
  rules: AutomationRuleRow[];
  migratedFromLocal: boolean;
} {
  if (Array.isArray(serverRules) && serverRules.length > 0) {
    return { rules: serverRules, migratedFromLocal: false };
  }
  const local = readLegacyLocalRules();
  if (local.length > 0) {
    return { rules: local, migratedFromLocal: true };
  }
  return { rules: [], migratedFromLocal: false };
}
