import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BoltIcon,
  EnvelopeIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { StatusChip } from '../../components/ui/StatusChip';
import { MetalCard } from '../../components/ui/MetalTile';

interface ChasePack {
  id: string;
  name: string;
  description: string;
  tone: string;
  boardColumns: string[] | null;
}

interface AutomationSettings {
  proposalChase: {
    enabled: boolean;
    schedule: string;
    chaseSequenceDays: number[];
  };
  emailFollowUp: {
    enabled: boolean;
    schedule: string;
    stages: Array<{ daysAfterSend: number; template: string }>;
  };
  proposalExpiry: {
    enabled: boolean;
    defaultExpiryDays: number;
    reminderDaysBefore: number[];
  };
  jobChasePacks: ChasePack[];
}

function toneChip(tone: string) {
  if (tone === 'URGENT') return 'danger' as const;
  if (tone === 'WARM') return 'success' as const;
  return 'neutral' as const;
}

/** Settings JSON can hand back a number/string instead of number[] — never call .join blind. */
function asList(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ') || '—';
  if (value == null || value === '') return '—';
  return String(value);
}

type LocalRule = {
  id: string;
  trigger: string;
  action: string;
  enabled: boolean;
};

const TRIGGERS = [
  { id: 'job.overdue', label: 'Job becomes overdue' },
  { id: 'job.column.REQUEST_RECORDS', label: 'Job enters Request records' },
  { id: 'job.column.HELP_NEEDED', label: 'Job needs help' },
  { id: 'proposal.unsigned_7d', label: 'Proposal unsigned 7 days' },
  { id: 'phase.complete', label: 'Job phase completed' },
  { id: 'document_request.stale', label: 'Document request unanswered 3 days' },
];

const ACTIONS = [
  { id: 'chase.RECORDS_REQUEST', label: 'Draft records request chase' },
  { id: 'chase.RECORDS_REMINDER', label: 'Draft records reminder' },
  { id: 'chase.DEADLINE_APPROACHING', label: 'Draft deadline approaching email' },
  { id: 'notify.assignee', label: 'Notify job assignee (in-app activity)' },
  { id: 'clara.rewrite', label: 'Clara rewrite last chase draft' },
  { id: 'resend_document_request', label: 'Re-send the document request email' },
];

const RULES_KEY = 'engage.practice.automationRules';

function loadRules(): LocalRule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** UK automation packs — install as local rules (W2.2) */
const UK_PACKS: Array<{
  id: string;
  name: string;
  description: string;
  badge: string;
  rules: Array<{ trigger: string; action: string }>;
}> = [
  {
    id: 'document-auto-chase',
    name: 'Document request auto-chase',
    description:
      'A sent document request still unanswered after 3 days is automatically re-sent (portal link included).',
    badge: 'DOCS',
    rules: [{ trigger: 'document_request.stale', action: 'resend_document_request' }],
  },
  {
    id: 'vat-records',
    name: 'VAT records chase',
    description:
      'When a job hits Request records, draft a VAT pack request; remind if still stuck.',
    badge: 'VAT',
    rules: [
      { trigger: 'job.column.REQUEST_RECORDS', action: 'chase.RECORDS_REQUEST' },
      { trigger: 'job.overdue', action: 'chase.RECORDS_REMINDER' },
    ],
  },
  {
    id: 'sa-deadline',
    name: 'Self Assessment deadline',
    description: 'Deadline approaching + help-needed notify for SA season pressure.',
    badge: 'SA',
    rules: [
      { trigger: 'job.overdue', action: 'chase.DEADLINE_APPROACHING' },
      { trigger: 'job.column.HELP_NEEDED', action: 'notify.assignee' },
    ],
  },
  {
    id: 'proposal-warm',
    name: 'Unsigned proposal warm-up',
    description: 'After 7 days unsigned, draft a firm-voice chase (Clara rewrite optional).',
    badge: 'Sales',
    rules: [
      { trigger: 'proposal.unsigned_7d', action: 'chase.DEADLINE_APPROACHING' },
      { trigger: 'proposal.unsigned_7d', action: 'clara.rewrite' },
    ],
  },
  {
    id: 'phase-handoff',
    name: 'Phase complete handoff',
    description:
      'On phase complete, notify assignee and prepare next-step records chase if needed.',
    badge: 'Delivery',
    rules: [
      { trigger: 'phase.complete', action: 'notify.assignee' },
      { trigger: 'job.column.REQUEST_RECORDS', action: 'chase.RECORDS_REQUEST' },
    ],
  },
  {
    id: 'mtd-quarter',
    name: 'MTD quarter pack',
    description: 'Quarter-end pressure: overdue → deadline email, help needed → in-app ping.',
    badge: 'MTD',
    rules: [
      { trigger: 'job.overdue', action: 'chase.DEADLINE_APPROACHING' },
      { trigger: 'job.column.HELP_NEEDED', action: 'clara.rewrite' },
    ],
  },
];

export default function PracticeAutomations() {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [rules, setRules] = useState<LocalRule[]>(() => loadRules());
  const [draftTrigger, setDraftTrigger] = useState(TRIGGERS[0].id);
  const [draftAction, setDraftAction] = useState(ACTIONS[0].id);
  const [packMsg, setPackMsg] = useState<string | null>(null);
  const [serverSync, setServerSync] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [runMsgRules, setRunMsgRules] = useState<string | null>(null);
  const [runHistory, setRunHistory] = useState<
    Array<{ id: string; action: string; description: string | null; at: string }>
  >([]);
  const [runDetail, setRunDetail] = useState<string | null>(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleLastRun, setScheduleLastRun] = useState<string | null>(null);
  const [scheduleLastSummary, setScheduleLastSummary] = useState<string | null>(null);
  const [scheduleConfirmOpen, setScheduleConfirmOpen] = useState(false);
  const [scheduleBusy, setScheduleBusy] = useState(false);

  async function loadSchedule() {
    try {
      const res = (await apiClient.get('/automation/schedule')) as any;
      const data = res?.data ?? res;
      setScheduleEnabled(Boolean(data?.enabled));
      setScheduleLastRun(data?.lastRunAt || null);
      setScheduleLastSummary(data?.lastRunSummary || null);
    } catch {
      /* leave defaults */
    }
  }

  async function setSchedule(enabled: boolean) {
    setScheduleBusy(true);
    try {
      await apiClient.put('/automation/schedule', { enabled });
      setScheduleEnabled(enabled);
      setScheduleConfirmOpen(false);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e.message || 'Failed to update schedule');
    } finally {
      setScheduleBusy(false);
    }
  }

  async function loadRunHistory() {
    try {
      const res = (await apiClient.get('/automation/runs?limit=12')) as any;
      const data = res?.data ?? res;
      setRunHistory(data?.runs || []);
    } catch {
      setRunHistory([]);
    }
  }

  function installPack(packId: string) {
    const pack = UK_PACKS.find((p) => p.id === packId);
    if (!pack) return;
    const existing = new Set(rules.map((r) => `${r.trigger}|${r.action}`));
    const additions: LocalRule[] = [];
    for (const r of pack.rules) {
      const key = `${r.trigger}|${r.action}`;
      if (existing.has(key)) continue;
      additions.push({
        id: `pack_${pack.id}_${Date.now()}_${additions.length}`,
        trigger: r.trigger,
        action: r.action,
        enabled: true,
      });
      existing.add(key);
    }
    if (additions.length === 0) {
      setPackMsg(`${pack.name}: all rules already installed`);
      return;
    }
    const next = [...rules, ...additions];
    setRules(next);
    setPackMsg(`Installed ${pack.name} (+${additions.length} rules) — saving to server…`);
    void (async () => {
      try {
        await apiClient.put('/automation/rules', {
          rules: next.map((r) => ({
            id: r.id,
            trigger: r.trigger,
            action: r.action,
            enabled: r.enabled,
            source: pack.id,
          })),
        });
        setServerSync('ok');
        setPackMsg(`Installed ${pack.name} (+${additions.length} rules) · saved to server`);
      } catch {
        setServerSync('err');
        setPackMsg(`Installed ${pack.name} locally — server save failed`);
      }
    })();
  }

  async function syncRulesToServer() {
    setServerSync('saving');
    setRunMsgRules(null);
    try {
      await apiClient.put('/automation/rules', {
        rules: rules.map((r) => ({
          id: r.id,
          trigger: r.trigger,
          action: r.action,
          enabled: r.enabled,
        })),
      });
      setServerSync('ok');
    } catch (e: any) {
      setServerSync('err');
      setError(e?.response?.data?.error?.message || e.message || 'Failed to sync rules');
    }
  }

  async function runServerRules(dryRun: boolean) {
    setRunning(dryRun ? 'rules-dry' : 'rules-live');
    setRunMsgRules(null);
    setError(null);
    try {
      // Ensure server has latest rules first
      await apiClient.put('/automation/rules', {
        rules: rules.map((r) => ({
          id: r.id,
          trigger: r.trigger,
          action: r.action,
          enabled: r.enabled,
        })),
      });
      const res = await apiClient.post('/automation/rules/run', { dryRun });
      const payload = (res as any)?.data ?? res;
      const msg =
        (res as any)?.message ||
        payload?.message ||
        (dryRun ? 'Dry run complete' : 'Rules executed');
      setRunMsgRules(msg);
      const results = payload?.results || payload?.data?.results;
      if (Array.isArray(results) && results.length) {
        const lines = results
          .slice(0, 8)
          .map(
            (r: { trigger?: string; matched?: number; acted?: number; details?: string[] }) =>
              `${r.trigger}: ${r.matched ?? 0} matched, ${r.acted ?? 0} acted${
                r.details?.[0] ? ` — ${r.details[0]}` : ''
              }`
          );
        setRunDetail(lines.join('\n'));
      } else {
        setRunDetail(null);
      }
      setServerSync('ok');
      await loadRunHistory();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e.message || 'Rule run failed');
    } finally {
      setRunning(null);
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    } catch {
      /* ignore */
    }
  }, [rules]);

  useEffect(() => {
    void loadSchedule();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = (await apiClient.get('/automation/settings')) as {
          data?: AutomationSettings & { automationRules?: LocalRule[] };
          success?: boolean;
        };
        // Interceptor unwraps axios body → { success, data }
        const data =
          res?.data ?? (res as unknown as AutomationSettings & { automationRules?: LocalRule[] });
        setSettings(data);
        // Prefer server rules when present (source of truth after first sync)
        if (Array.isArray(data?.automationRules) && data.automationRules.length > 0) {
          setRules(
            data.automationRules.map((r) => ({
              id: r.id,
              trigger: r.trigger,
              action: r.action,
              enabled: r.enabled !== false,
            }))
          );
        }
        await loadRunHistory();
      } catch (e: any) {
        setError(e?.response?.data?.error?.message || e.message || 'Failed to load automations');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function runJob(kind: 'proposal-chase' | 'email-followup') {
    setRunning(kind);
    setRunMsg(null);
    setError(null);
    try {
      const path =
        kind === 'proposal-chase'
          ? '/automation/proposal-chase/run'
          : '/automation/email-followup/run';
      const res = await apiClient.post(path, {});
      const msg = (res as any)?.message || (res as any)?.data?.message || 'Run completed';
      setRunMsg(msg);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e.message || 'Run failed');
    } finally {
      setRunning(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-slate-100" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-28 animate-pulse bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            <BoltIcon className="h-6 w-6 text-emerald-500" />
            Automations
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-slate-500">
            UK chase packs, scheduled follow-ups, and a visual rule builder synced to the firm
            server — dry-run or execute against live jobs.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/inbox" className="btn-secondary text-sm">
            Firm inbox
          </Link>
          <Link to="/jobs" className="btn-secondary text-sm">
            Jobs board
          </Link>
        </div>
      </div>

      {/* Scheduled runs — opt-in */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Run rules daily, automatically
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {scheduleEnabled
              ? `On — server runs your enabled rules every 24h with a 3-day per-client cooldown.${
                  scheduleLastRun
                    ? ` Last run ${new Date(scheduleLastRun).toLocaleString('en-GB')}${
                        scheduleLastSummary
                          ? ` — ${scheduleLastSummary.replace('Scheduled automation run: ', '')}`
                          : ''
                      }.`
                    : ' No run yet.'
                }`
              : 'Off — rules only run when you press Execute. Turn on to chase records and deadlines automatically.'}
          </p>
        </div>
        <button
          type="button"
          disabled={scheduleBusy}
          onClick={() => {
            if (scheduleEnabled) void setSchedule(false);
            else setScheduleConfirmOpen(true);
          }}
          className={`text-sm font-medium px-4 py-2 rounded-lg cursor-pointer ${
            scheduleEnabled
              ? 'border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {scheduleBusy ? 'Saving…' : scheduleEnabled ? 'Turn off' : 'Turn on daily runs'}
        </button>
      </section>

      {scheduleConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Start sending automatically?
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your enabled rules will run every 24 hours and can email clients without anyone
              pressing a button (chases, document-request re-sends). A 3-day cooldown stops the same
              client being contacted about the same thing repeatedly. This change is recorded in the
              audit log.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setScheduleConfirmOpen(false)}
                className="btn-secondary text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={scheduleBusy}
                onClick={() => void setSchedule(true)}
                className="btn-primary text-sm cursor-pointer"
              >
                {scheduleBusy ? 'Saving…' : 'Enable daily runs'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UK pack library */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              UK automation packs
            </h2>
            <p className="text-xs text-slate-400">
              One-click install into the local builder — VAT, SA, MTD, proposal warm-up
            </p>
          </div>
          {packMsg && <StatusChip tone="success">{packMsg}</StatusChip>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {UK_PACKS.map((pack) => (
            <article key={pack.id} className="metal-tile flex flex-col p-4">
              <span className="metal-specular" aria-hidden />
              <div className="relative z-[1] flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-50">{pack.name}</h3>
                  <StatusChip tone="mint">{pack.badge}</StatusChip>
                </div>
                <p className="mt-2 flex-1 text-sm text-slate-500">{pack.description}</p>
                <p className="mt-2 text-2xs text-slate-400">
                  {pack.rules.length} rules ·{' '}
                  {pack.rules
                    .map((r) => TRIGGERS.find((t) => t.id === r.trigger)?.label || r.trigger)
                    .slice(0, 2)
                    .join(' · ')}
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-3 w-full text-xs"
                  onClick={() => installPack(pack.id)}
                >
                  Install pack
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Visual rule builder */}
      <MetalCard tone="mint" className="p-5">
        <span className="metal-kicker">Rule builder</span>
        <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
          When this → then that
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Rules sync to the firm (tenant settings). Dry-run previews matches; Execute drafts chase
          notes and assignee notifications on live jobs.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            Trigger
            <select
              className="input-field mt-1"
              value={draftTrigger}
              onChange={(e) => setDraftTrigger(e.target.value)}
            >
              {TRIGGERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Action
            <select
              className="input-field mt-1"
              value={draftAction}
              onChange={(e) => setDraftAction(e.target.value)}
            >
              {ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-accent inline-flex items-center gap-1 text-sm"
            onClick={() =>
              setRules((r) => [
                ...r,
                {
                  id: `rule_${Date.now()}`,
                  trigger: draftTrigger,
                  action: draftAction,
                  enabled: true,
                },
              ])
            }
          >
            <PlusIcon className="h-4 w-4" />
            Add rule
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={serverSync === 'saving'}
            onClick={() => void syncRulesToServer()}
          >
            {serverSync === 'saving'
              ? 'Saving…'
              : serverSync === 'ok'
                ? 'Saved to server'
                : 'Save to server'}
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={running !== null}
            onClick={() => void runServerRules(true)}
          >
            {running === 'rules-dry' ? 'Running…' : 'Dry-run rules'}
          </button>
          <button
            type="button"
            className="btn-secondary text-sm text-amber-800"
            disabled={running !== null}
            onClick={() => void runServerRules(false)}
          >
            {running === 'rules-live' ? 'Executing…' : 'Execute rules'}
          </button>
        </div>
        {runMsgRules && (
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{runMsgRules}</p>
        )}
        {runDetail && (
          <pre className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-white/80 p-2 text-2xs text-slate-600 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
            {runDetail}
          </pre>
        )}
        <ul className="mt-4 space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900/40"
            >
              <div className="min-w-0">
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  When{' '}
                  <span className="text-emerald-700 dark:text-emerald-300">
                    {TRIGGERS.find((t) => t.id === rule.trigger)?.label || rule.trigger}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  Then {ACTIONS.find((a) => a.id === rule.action)?.label || rule.action}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setRules((prev) =>
                      prev.map((x) => (x.id === rule.id ? { ...x, enabled: !x.enabled } : x))
                    )
                  }
                >
                  <StatusChip tone={rule.enabled ? 'success' : 'neutral'}>
                    {rule.enabled ? 'On' : 'Off'}
                  </StatusChip>
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Delete rule"
                  onClick={() => setRules((r) => r.filter((x) => x.id !== rule.id))}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
          {rules.length === 0 && (
            <li className="text-sm text-slate-500">No custom rules yet — add one above.</li>
          )}
        </ul>
      </MetalCard>

      {/* Run history */}
      <section className="metal-tile p-5">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1]">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="metal-kicker">Run history</p>
              <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">
                Recent automation activity
              </h2>
            </div>
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => void loadRunHistory()}
            >
              Refresh
            </button>
          </div>
          {runHistory.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No runs yet. Use Dry-run or Execute above to create a trail.
            </p>
          ) : (
            <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {runHistory.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/70 bg-white/60 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <div>
                    <StatusChip tone={r.action === 'AUTOMATION_RUN' ? 'mint' : 'info'}>
                      {r.action.replace(/_/g, ' ')}
                    </StatusChip>
                    <p className="mt-1 text-slate-700 dark:text-slate-200">
                      {r.description || 'Automation event'}
                    </p>
                  </div>
                  <span className="text-2xs tabular-nums text-slate-400">
                    {new Date(r.at).toLocaleString('en-GB')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {runMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {runMsg}
        </div>
      )}

      {/* Proposal / money loop automations */}
      <section className="grid gap-3 md:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-950/40">
              <EnvelopeIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-900 dark:text-slate-50">
                  Proposal chase sequence
                </h2>
                <StatusChip tone={settings?.proposalChase.enabled ? 'success' : 'neutral'}>
                  {settings?.proposalChase.enabled ? 'On' : 'Off'}
                </StatusChip>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Days after send:{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {asList(settings?.proposalChase?.chaseSequenceDays)}
                </span>
              </p>
              <p className="text-2xs text-slate-400">
                Schedule · {settings?.proposalChase.schedule}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  disabled={running !== null}
                  onClick={() => void runJob('proposal-chase')}
                >
                  {running === 'proposal-chase' ? 'Running…' : 'Run proposal chase'}
                </button>
                <Link to="/jobs" className="btn-secondary text-xs">
                  Open jobs
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/40">
              <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-slate-900 dark:text-slate-50">
                  Expiry & renewal reminders
                </h2>
                <StatusChip tone={settings?.proposalExpiry.enabled ? 'success' : 'neutral'}>
                  {settings?.proposalExpiry.enabled ? 'On' : 'Off'}
                </StatusChip>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Default validity{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {settings?.proposalExpiry?.defaultExpiryDays ?? '—'} days
                </span>
                · remind{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {asList(settings?.proposalExpiry?.reminderDaysBefore)}
                </span>{' '}
                days before
              </p>
              <Link to="/proposals/renewals" className="btn-secondary mt-3 inline-flex text-xs">
                Bulk renewals
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Job chase packs catalogue */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Delivery chase packs
            </h2>
            <p className="text-xs text-slate-400">
              Used from job detail · Clara can rewrite in firm voice
            </p>
          </div>
          <Link to="/jobs" className="text-xs font-medium text-emerald-600 hover:underline">
            Open a job to send →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(settings?.jobChasePacks || []).map((pack) => (
            <article key={pack.id} className="metal-tile flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BriefcaseIcon className="h-4 w-4 text-emerald-500" />
                  <h3 className="font-semibold text-slate-900 dark:text-slate-50">{pack.name}</h3>
                </div>
                <StatusChip tone={toneChip(pack.tone)}>{pack.tone}</StatusChip>
              </div>
              <p className="mt-2 flex-1 text-sm text-slate-500">{pack.description}</p>
              {pack.boardColumns?.length ? (
                <p className="mt-2 text-2xs text-slate-400">
                  Best on ·{' '}
                  {pack.boardColumns.map((c) => c.replace(/_/g, ' ').toLowerCase()).join(', ')}
                </p>
              ) : (
                <p className="mt-2 text-2xs text-slate-400">Any board column</p>
              )}
            </article>
          ))}
          {(!settings?.jobChasePacks || settings.jobChasePacks.length === 0) && (
            <div className="card col-span-full p-8 text-center text-sm text-slate-500">
              No chase packs configured
            </div>
          )}
        </div>
      </section>

      <div className="metal-tile border-dashed p-5">
        <span className="metal-kicker">Roadmap</span>
        <h2 className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
          Coming next
        </h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-500">
          <li>Server-side execution for installed packs</li>
          <li>SMS add-on for records chases</li>
          <li>Two-way M365 / Gmail timeline on clients</li>
          <li>Clara rewrite inside each pack action</li>
        </ul>
      </div>
    </div>
  );
}
