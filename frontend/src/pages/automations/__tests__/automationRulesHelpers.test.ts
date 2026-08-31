import { describe, expect, it } from 'vitest';
import {
  groupRulesByTrigger,
  mergePackRules,
  resolveLoadedRules,
  ruleKey,
} from '../automationRulesHelpers';

const TRIGGERS = [
  { id: 'job.overdue', label: 'Job becomes overdue' },
  { id: 'proposal.unsigned_7d', label: 'Proposal unsigned 7 days' },
];

describe('groupRulesByTrigger', () => {
  it('groups actions under the first-seen trigger and keeps order', () => {
    const groups = groupRulesByTrigger(
      [
        { id: '1', trigger: 'job.overdue', action: 'chase.A', enabled: true },
        { id: '2', trigger: 'proposal.unsigned_7d', action: 'clara.rewrite', enabled: true },
        { id: '3', trigger: 'job.overdue', action: 'notify.assignee', enabled: false },
      ],
      TRIGGERS
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].triggerLabel).toBe('Job becomes overdue');
    expect(groups[0].rules.map((r) => r.id)).toEqual(['1', '3']);
    expect(groups[1].triggerLabel).toBe('Proposal unsigned 7 days');
  });

  it('falls back to the raw trigger id when the catalogue has no label', () => {
    const groups = groupRulesByTrigger(
      [{ id: '1', trigger: 'custom.x', action: 'notify.assignee', enabled: true }],
      TRIGGERS
    );
    expect(groups[0].triggerLabel).toBe('custom.x');
  });
});

describe('mergePackRules', () => {
  it('skips trigger+action pairs that already exist', () => {
    const existing = [{ id: 'a', trigger: 'job.overdue', action: 'chase.A', enabled: true }];
    const result = mergePackRules(
      existing,
      {
        id: 'vat',
        rules: [
          { trigger: 'job.overdue', action: 'chase.A' },
          { trigger: 'job.overdue', action: 'notify.assignee' },
        ],
      },
      1
    );
    expect(result.added).toBe(1);
    expect(result.next).toHaveLength(2);
    expect(ruleKey(result.next[1])).toBe('job.overdue|notify.assignee');
  });
});

describe('resolveLoadedRules', () => {
  it('prefers firm rules over an empty server list', () => {
    const server = [{ id: 's', trigger: 'job.overdue', action: 'chase.A', enabled: true }];
    expect(resolveLoadedRules(server)).toEqual({ rules: server, migratedFromLocal: false });
  });

  it('returns empty when neither firm nor browser has rules', () => {
    expect(resolveLoadedRules([])).toEqual({ rules: [], migratedFromLocal: false });
    expect(resolveLoadedRules(null)).toEqual({ rules: [], migratedFromLocal: false });
  });
});
