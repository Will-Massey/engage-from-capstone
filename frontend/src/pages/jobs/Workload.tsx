import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UsersIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import {
  StatusChip,
  MoneyPill,
  StaffAvatar,
  boardColumnLabel,
  boardColumnTone,
} from '../../components/ui/StatusChip';
import {
  MetalTile,
  MetalProgress,
  StatusGem,
  SegmentedMeter,
  HeatDot,
} from '../../components/ui/MetalTile';

interface WorkloadStaff {
  assigneeId: string | null;
  name: string;
  openCount: number;
  overdueCount: number;
  feePence: number;
  actualPence: number;
  loggedMinutes?: number;
  capacityOpenJobs?: number;
  capacityHours?: number;
  loadPct?: number;
  hoursPct?: number;
  recoveryPct?: number;
  jobs: Array<{
    id: string;
    title: string;
    reference: string;
    boardColumn: string;
    dueAt: string | null;
    deadlineKind: string;
    proposedFeePence: number;
    client: { id: string; name: string };
  }>;
}

interface Totals {
  open: number;
  overdue: number;
  feePence: number;
  actualPence?: number;
  loggedMinutes?: number;
  loadPct?: number;
  recoveryPct?: number;
}

function heatLevel(loadPct: number, overdue: number): 0 | 1 | 2 | 3 | 4 {
  if (overdue >= 3 || loadPct >= 125) return 4;
  if (overdue >= 1 || loadPct >= 100) return 3;
  if (loadPct >= 75) return 2;
  if (loadPct >= 40) return 1;
  return 0;
}

function formatHours(minutes: number): string {
  const h = minutes / 60;
  if (h < 1) return `${minutes}m`;
  return `${h.toFixed(1)}h`;
}

export default function Workload() {
  const [staff, setStaff] = useState<WorkloadStaff[]>([]);
  const [totals, setTotals] = useState<Totals>({ open: 0, overdue: 0, feePence: 0 });
  const [capacityHours, setCapacityHours] = useState(37.5);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/jobs/meta/workload');
        const data = res.data?.data ?? res.data;
        setStaff(data.staff || []);
        setTotals(data.totals || { open: 0, overdue: 0, feePence: 0 });
        if (data.capacityHours) setCapacityHours(data.capacityHours);
      } catch (e: any) {
        setError(e?.response?.data?.error?.message || e.message || 'Failed to load workload');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-100" />
        <div className="grid gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="metal-tile h-24 animate-pulse" />
          ))}
        </div>
        <div className="metal-tile h-48 animate-pulse" />
      </div>
    );
  }

  const onTrack = Math.max(0, totals.open - totals.overdue);
  const avgLoad = totals.loadPct ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            <UsersIcon className="h-6 w-6 text-emerald-500" />
            Workload
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Capacity vs open jobs · fee recovery · overdue heat — {capacityHours}h nominal week
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/jobs?filter=overdue" className="btn-secondary text-sm">
            Overdue board
          </Link>
          <Link to="/jobs" className="btn-secondary text-sm">
            Jobs board
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetalTile
          tone="sky"
          kicker="Open"
          title="Open jobs"
          value={totals.open}
          hint={`${onTrack} on track`}
        />
        <MetalTile
          tone="rose"
          kicker="Risk"
          title="Overdue"
          value={totals.overdue}
          hint={totals.overdue ? 'Needs attention' : 'Clear'}
        />
        <MetalTile
          tone="mint"
          kicker="Money"
          title="Fee at risk"
          value={`£${(totals.feePence / 100).toLocaleString('en-GB')}`}
          hint={
            totals.recoveryPct != null
              ? `${totals.recoveryPct}% time recovered`
              : undefined
          }
        />
        <MetalTile
          tone={avgLoad >= 100 ? 'amber' : 'violet'}
          kicker="Utilisation"
          title="Avg team load"
          value={`${avgLoad}%`}
          hint={`${formatHours(totals.loggedMinutes || 0)} logged on open work`}
        />
      </div>

      {totals.open > 0 && (
        <div className="metal-tile p-4">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1]">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="metal-kicker">Pipeline composition</span>
              <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <HeatDot level={4} /> Overdue {totals.overdue}
                </span>
                <span className="inline-flex items-center gap-1">
                  <HeatDot level={1} /> On track {onTrack}
                </span>
              </div>
            </div>
            <SegmentedMeter
              segments={[
                { value: totals.overdue, tone: 'rose', label: 'Overdue' },
                { value: onTrack, tone: 'mint', label: 'On track' },
              ]}
            />
          </div>
        </div>
      )}

      {staff.length === 0 ? (
        <div className="metal-tile p-10 text-center text-slate-500">
          No open jobs — accept a proposal to spawn work.
        </div>
      ) : (
        <div className="space-y-4">
          {staff.map((s) => {
            const parts = s.name.split(' ');
            const loadPct = s.loadPct ?? Math.round((s.openCount / 8) * 100);
            const hoursPct = s.hoursPct ?? 0;
            const recoveryPct = s.recoveryPct ?? 0;
            const heat = heatLevel(loadPct, s.overdueCount);
            return (
              <section
                key={s.assigneeId || 'unassigned'}
                className="metal-tile overflow-hidden"
              >
                <span className="metal-specular" aria-hidden />
                <header className="relative z-[1] flex flex-wrap items-center justify-between gap-3 border-b border-white/40 px-4 py-3 dark:border-slate-700/60">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <StaffAvatar firstName={parts[0]} lastName={parts[1]} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-slate-900 dark:text-slate-50">
                          {s.name}
                        </h2>
                        <StatusGem
                          tone={
                            heat >= 3 ? 'rose' : heat === 2 ? 'amber' : heat === 1 ? 'mint' : 'default'
                          }
                        >
                          {heat >= 3 ? 'Overloaded' : heat === 2 ? 'Busy' : heat === 1 ? 'Healthy' : 'Light'}
                        </StatusGem>
                        <span className="inline-flex gap-0.5" title="Heat">
                          {[0, 1, 2, 3, 4].map((i) => (
                            <HeatDot key={i} level={(i <= heat ? heat : 0) as 0 | 1 | 2 | 3 | 4} />
                          ))}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {s.openCount} open
                        {s.overdueCount > 0 && (
                          <span className="ml-2 font-semibold text-red-600">
                            · {s.overdueCount} overdue
                          </span>
                        )}
                        {s.loggedMinutes != null && s.loggedMinutes > 0 && (
                          <span className="ml-2">· {formatHours(s.loggedMinutes)} logged</span>
                        )}
                      </p>
                      <div className="mt-2 grid max-w-md gap-1.5 sm:grid-cols-2">
                        <MetalProgress
                          pct={Math.min(150, loadPct)}
                          tone="auto"
                          height="h-2"
                          label="Job load"
                          showPct
                        />
                        <MetalProgress
                          pct={Math.min(150, hoursPct)}
                          tone="sky"
                          height="h-2"
                          label={`Hours / ${s.capacityHours ?? capacityHours}h`}
                          showPct
                        />
                      </div>
                      {recoveryPct > 0 && (
                        <MetalProgress
                          pct={recoveryPct}
                          tone="mint"
                          height="h-1.5"
                          className="mt-1.5 max-w-md"
                          label="Fee recovery (time value)"
                          showPct
                        />
                      )}
                    </div>
                  </div>
                  <MoneyPill pence={s.feePence} emphasize />
                </header>
                <ul className="relative z-[1] divide-y divide-slate-200/60 dark:divide-slate-700/60">
                  {s.jobs.map((j) => {
                    const overdue = j.dueAt && new Date(j.dueAt) < new Date();
                    return (
                      <li
                        key={j.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <Link
                            to={`/jobs/${j.id}`}
                            className="font-medium text-slate-900 hover:text-emerald-600 dark:text-slate-50"
                          >
                            {j.client.name}
                          </Link>
                          <p className="truncate text-xs text-slate-500">{j.title}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusChip tone={boardColumnTone(j.boardColumn)}>
                            {boardColumnLabel(j.boardColumn)}
                          </StatusChip>
                          {j.dueAt && (
                            <StatusChip
                              tone={
                                overdue
                                  ? 'danger'
                                  : j.deadlineKind === 'STATUTORY'
                                    ? 'info'
                                    : 'neutral'
                              }
                            >
                              {overdue && <ExclamationTriangleIcon className="h-3 w-3" />}
                              {new Date(j.dueAt).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                              {j.deadlineKind === 'STATUTORY' ? ' · statutory' : ''}
                            </StatusChip>
                          )}
                          <MoneyPill pence={j.proposedFeePence} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
