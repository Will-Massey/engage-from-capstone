import { computeJobDeadline } from '../jobDeadlineService.js';

describe('computeJobDeadline', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('uses YE + 9 months for statutory accounts', () => {
    const hint = computeJobDeadline({
      serviceNames: ['Statutory Annual Accounts'],
      yearEnd: '31/03',
      now,
    });
    expect(hint.deadlineKind).toBe('STATUTORY');
    expect(hint.ruleId).toBe('ch-accounts-9m');
    expect(hint.dueAt).not.toBeNull();
    // YE 31 Mar 2027 (next) + 9m = 31 Dec 2027
    expect(hint.dueAt!.getFullYear()).toBe(2027);
    expect(hint.dueAt!.getMonth()).toBe(11); // December
  });

  it('prefers explicit client accounts due date', () => {
    const explicit = new Date('2026-09-01T00:00:00Z');
    const hint = computeJobDeadline({
      serviceNames: ['Annual Accounts Preparation'],
      yearEnd: '31/12',
      nextAccountsDueDate: explicit,
      now,
    });
    expect(hint.ruleId).toBe('client-accounts-due');
    expect(hint.dueAt!.toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('sets SA deadline to 31 January', () => {
    const hint = computeJobDeadline({
      serviceNames: ['Personal Tax Return (SA100)'],
      now: new Date('2026-03-01T12:00:00Z'),
    });
    expect(hint.ruleId).toBe('sa-31-jan');
    expect(hint.dueAt!.getMonth()).toBe(0);
    expect(hint.dueAt!.getDate()).toBe(31);
  });

  it('returns NONE when no rules match', () => {
    const hint = computeJobDeadline({
      serviceNames: ['Strategy workshop'],
      now,
    });
    expect(hint.deadlineKind).toBe('NONE');
    expect(hint.dueAt).toBeNull();
  });

  it('payroll uses internal month-end', () => {
    const hint = computeJobDeadline({
      serviceNames: ['Monthly Payroll Processing'],
      now: new Date('2026-06-10T12:00:00Z'),
    });
    expect(hint.deadlineKind).toBe('INTERNAL');
    expect(hint.ruleId).toBe('payroll-month-end');
  });
});
