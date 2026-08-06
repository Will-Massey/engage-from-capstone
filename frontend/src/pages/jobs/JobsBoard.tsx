import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  ArrowsRightLeftIcon,
  BriefcaseIcon,
  CurrencyPoundIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import {
  StatusChip,
  MoneyPill,
  ProgressRing,
  ProgressBar,
  StaffAvatar,
  boardColumnTone,
  boardColumnLabel,
  boardColumnChrome,
} from '../../components/ui/StatusChip';
import { MetalTile, MetalProgress } from '../../components/ui/MetalTile';
import ClaraBoardPriorities from '../../components/jobs/ClaraBoardPriorities';

type BoardColumn =
  | 'REQUEST_RECORDS'
  | 'RECORDS_RECEIVED'
  | 'IN_PROGRESS'
  | 'HELP_NEEDED'
  | 'IN_REVIEW'
  | 'COMPLETE';

type ViewMode = 'board' | 'list';
type DueFilter = 'all' | 'overdue' | 'week' | 'help';
type AssigneeFilter = 'all' | 'unassigned' | string;

interface JobCard {
  id: string;
  reference: string;
  title: string;
  boardColumn: BoardColumn;
  proposedFeePence: number;
  budgetPence: number;
  actualPence: number;
  dueAt: string | null;
  deadlineKind?: string;
  client: { id: string; name: string; contactName: string | null };
  assignee: { id: string; firstName: string; lastName: string } | null;
  phases: Array<{
    id: string;
    name: string;
    isComplete: boolean;
    progressPct: number;
  }>;
}

const COLUMN_ORDER: BoardColumn[] = [
  'REQUEST_RECORDS',
  'RECORDS_RECEIVED',
  'IN_PROGRESS',
  'HELP_NEEDED',
  'IN_REVIEW',
  'COMPLETE',
];

const DND_MIME = 'application/x-engage-job-id';

function phaseProgress(job: JobCard): number {
  if (!job.phases?.length) return 0;
  const sum = job.phases.reduce((a, p) => a + (p.progressPct || 0), 0);
  return Math.round(sum / job.phases.length);
}

function daysLabel(
  dueAt: string | null
): { text: string; tone: 'danger' | 'warning' | 'neutral' | 'info' } | null {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: 'danger' };
  if (days <= 7) return { text: `${days}d left`, tone: 'warning' };
  return {
    text: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    tone: 'info',
  };
}

function JobCardView({
  job,
  movingId,
  draggingId,
  onDragStart,
  onDragEnd,
  onMove,
  compact,
  selected,
  onToggleSelect,
}: {
  job: JobCard;
  movingId: string | null;
  draggingId: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onMove: (id: string, col: BoardColumn) => void;
  compact?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const pct = phaseProgress(job);
  const due = daysLabel(job.dueAt);
  const currentPhase = job.phases.find((p) => !p.isComplete) || job.phases[job.phases.length - 1];
  const isDragging = draggingId === job.id;

  return (
    <article
      draggable={!compact && movingId !== job.id}
      onDragStart={compact ? undefined : (e) => onDragStart(e, job.id)}
      onDragEnd={compact ? undefined : onDragEnd}
      className={`metal-tile group relative overflow-hidden p-3 ${
        compact ? '' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-50 ring-2 ring-emerald-400' : ''} ${
        movingId === job.id ? 'opacity-70' : ''
      } ${selected ? 'metal-tile--mint ring-2 ring-emerald-400/60' : ''}`}
    >
      <span className="metal-specular" aria-hidden />
      <span className="metal-glare" aria-hidden />
      {/* Top accent by progress */}
      <div
        className={`absolute inset-x-0 top-0 z-[1] h-1 bg-gradient-to-r ${
          pct >= 100
            ? 'from-emerald-400 to-green-500'
            : pct >= 50
              ? 'from-sky-400 to-blue-500'
              : pct > 0
                ? 'from-amber-400 to-orange-500'
                : 'from-slate-200 to-slate-300'
        }`}
      />
      <div className="relative z-[1] flex items-start justify-between gap-2 pt-0.5">
        <div className="flex min-w-0 items-start gap-2">
          {onToggleSelect && (
            <input
              type="checkbox"
              className="mt-1 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              checked={!!selected}
              onChange={() => onToggleSelect(job.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${job.client.name}`}
            />
          )}
          <div className="min-w-0">
            <Link
              to={`/jobs/${job.id}`}
              className="block truncate text-sm font-semibold text-slate-900 hover:text-emerald-600 dark:text-slate-50"
              onClick={(e) => {
                if (draggingId) e.preventDefault();
              }}
            >
              {job.client.name}
            </Link>
            <p className="truncate text-xs text-slate-500">{job.title}</p>
          </div>
        </div>
        <ProgressRing pct={pct} showLabel size={36} stroke={3.5} />
      </div>
      <div className="relative z-[1]">
        <ProgressBar pct={pct} className="mt-2.5" height="h-1.5" />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <MoneyPill pence={job.proposedFeePence} emphasize />
          {due && <StatusChip tone={due.tone}>{due.text}</StatusChip>}
          {job.deadlineKind === 'STATUTORY' && <StatusChip tone="info">Statutory</StatusChip>}
          {job.boardColumn === 'HELP_NEEDED' && (
            <StatusChip tone="violet">
              <ExclamationTriangleIcon className="h-3 w-3" />
              Help
            </StatusChip>
          )}
          <span className="text-2xs text-slate-400">{job.reference}</span>
        </div>
        {currentPhase && (
          <p className="mt-2 truncate rounded-md bg-white/60 px-1.5 py-1 text-2xs text-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
            <span className="font-medium text-slate-500">Next · </span>
            {currentPhase.name}
            {currentPhase.progressPct > 0 ? ` · ${currentPhase.progressPct}%` : ''}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between">
          {job.assignee ? (
            <StaffAvatar firstName={job.assignee.firstName} lastName={job.assignee.lastName} />
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs text-slate-400 dark:bg-slate-900">
              Unassigned
            </span>
          )}
          <div className="relative">
            <label className="sr-only" htmlFor={`move-${job.id}`}>
              Move job
            </label>
            <select
              id={`move-${job.id}`}
              className="appearance-none rounded-md border border-transparent bg-transparent py-1 pl-1 pr-6 text-2xs font-medium text-slate-500 hover:border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              value={job.boardColumn}
              disabled={movingId === job.id}
              onChange={(e) => onMove(job.id, e.target.value as BoardColumn)}
              onClick={(e) => e.stopPropagation()}
            >
              {COLUMN_ORDER.map((c) => (
                <option key={c} value={c}>
                  {boardColumnLabel(c)}
                </option>
              ))}
            </select>
            <ArrowsRightLeftIcon className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
      </div>
    </article>
  );
}

export default function JobsBoard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [columnsMeta, setColumnsMeta] = useState<
    Array<{ id: string; count: number; feePence: number }>
  >([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<BoardColumn | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const initialFilter = searchParams.get('filter');
  const [dueFilter, setDueFilter] = useState<DueFilter>(() => {
    if (initialFilter === 'overdue' || initialFilter === 'week' || initialFilter === 'help') {
      return initialFilter;
    }
    return 'all';
  });
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('engage.jobs.view') as ViewMode) || 'board';
    } catch {
      return 'board';
    }
  });

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'overdue' || f === 'week' || f === 'help' || f === 'all') {
      setDueFilter(f === 'all' ? 'all' : f);
    }
  }, [searchParams]);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get('/jobs', { params: q ? { q } : {} });
        const data = res.data?.data ?? res.data;
        setJobs(data.jobs || []);
        setColumnsMeta(data.columns || []);
      } catch (e: any) {
        setError(e?.response?.data?.error?.message || e.message || 'Failed to load jobs');
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [q]
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    try {
      localStorage.setItem('engage.jobs.view', viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  const assignees = useMemo(() => {
    const map = new Map<string, { id: string; firstName: string; lastName: string }>();
    for (const j of jobs) {
      if (j.assignee) map.set(j.assignee.id, j.assignee);
    }
    return Array.from(map.values()).sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;
    return jobs.filter((j) => {
      if (assigneeFilter === 'unassigned' && j.assignee) return false;
      if (
        assigneeFilter !== 'all' &&
        assigneeFilter !== 'unassigned' &&
        j.assignee?.id !== assigneeFilter
      ) {
        return false;
      }
      if (dueFilter === 'help') return j.boardColumn === 'HELP_NEEDED';
      if (dueFilter === 'all') return true;
      if (!j.dueAt) return false;
      const t = new Date(j.dueAt).getTime();
      if (dueFilter === 'overdue') return t < now;
      if (dueFilter === 'week') return t >= now && t - now <= week;
      return true;
    });
  }, [jobs, dueFilter, assigneeFilter]);

  const byColumn = useMemo(() => {
    const map: Record<string, JobCard[]> = {};
    for (const col of COLUMN_ORDER) map[col] = [];
    for (const j of filteredJobs) {
      (map[j.boardColumn] || (map[j.boardColumn] = [])).push(j);
    }
    return map;
  }, [filteredJobs]);

  const moneyUnderManagement = useMemo(() => {
    const open = jobs.filter((j) => j.boardColumn !== 'COMPLETE');
    const overdue = open.filter((j) => j.dueAt && new Date(j.dueAt) < new Date());
    return {
      openFee: open.reduce((s, j) => s + j.proposedFeePence, 0),
      openCount: open.length,
      overdueFee: overdue.reduce((s, j) => s + j.proposedFeePence, 0),
      overdueCount: overdue.length,
      completeFee: jobs
        .filter((j) => j.boardColumn === 'COMPLETE')
        .reduce((s, j) => s + j.proposedFeePence, 0),
      helpCount: jobs.filter((j) => j.boardColumn === 'HELP_NEEDED').length,
    };
  }, [jobs]);

  const visibleColumnMeta = useMemo(() => {
    return COLUMN_ORDER.map((id) => {
      const list = byColumn[id] || [];
      return {
        id,
        count: list.length,
        feePence: list.reduce((s, j) => s + j.proposedFeePence, 0),
      };
    });
  }, [byColumn]);

  const listSorted = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
  }, [filteredJobs]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkMove(boardColumn: BoardColumn) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      await apiClient.post('/jobs/bulk/column', {
        jobIds: [...selectedIds],
        boardColumn,
      });
      setSelectedIds(new Set());
      await load({ quiet: true });
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e.message || 'Bulk move failed');
    } finally {
      setBulkBusy(false);
    }
  }

  async function moveJob(jobId: string, boardColumn: BoardColumn) {
    const prev = jobs.find((j) => j.id === jobId);
    if (!prev || prev.boardColumn === boardColumn) return;

    setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, boardColumn } : j)));
    setMovingId(jobId);
    try {
      await apiClient.patch(`/jobs/${jobId}/column`, { boardColumn });
      void load({ quiet: true });
    } catch (e: any) {
      setJobs((list) =>
        list.map((j) => (j.id === jobId ? { ...j, boardColumn: prev.boardColumn } : j))
      );
      setError(e?.response?.data?.error?.message || 'Move failed');
    } finally {
      setMovingId(null);
    }
  }

  function onDragStart(e: React.DragEvent, jobId: string) {
    e.dataTransfer.setData(DND_MIME, jobId);
    e.dataTransfer.setData('text/plain', jobId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(jobId);
  }

  function onDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  function onColumnDragOver(e: React.DragEvent, col: BoardColumn) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== col) setDragOverCol(col);
  }

  function onColumnDrop(e: React.DragEvent, col: BoardColumn) {
    e.preventDefault();
    const jobId = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain');
    setDragOverCol(null);
    setDraggingId(null);
    if (jobId) void moveJob(jobId, col);
  }

  const filtersActive = dueFilter !== 'all' || assigneeFilter !== 'all' || !!q;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            <BriefcaseIcon className="h-6 w-6 text-emerald-500" aria-hidden />
            Jobs board
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Drag cards · filters for overdue & help · open a card for phases & time
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-xl border border-slate-200/90 bg-white p-1 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-800"
            role="group"
            aria-label="Filter jobs by urgency"
          >
            {(
              [
                ['all', 'All'],
                ['overdue', 'Overdue'],
                ['week', 'Due 7d'],
                ['help', 'Help'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setDueFilter(k);
                  if (k === 'all') {
                    searchParams.delete('filter');
                    setSearchParams(searchParams, { replace: true });
                  } else {
                    setSearchParams({ filter: k }, { replace: true });
                  }
                }}
                className={`min-h-9 cursor-pointer rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                  dueFilter === k
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {label}
                {k === 'help' && moneyUnderManagement.helpCount > 0 ? (
                  <span className="ml-1 tabular-nums opacity-90">
                    {moneyUnderManagement.helpCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <select
            className="input-field max-w-[10rem] py-1.5 text-xs"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value as AssigneeFilter)}
            aria-label="Filter by assignee"
          >
            <option value="all">All staff</option>
            <option value="unassigned">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              title="Board view"
              onClick={() => setViewMode('board')}
              className={`rounded-md p-1.5 ${
                viewMode === 'board'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <Squares2X2Icon className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="List view"
              onClick={() => setViewMode('list')}
              className={`rounded-md p-1.5 ${
                viewMode === 'list'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <ListBulletIcon className="h-4 w-4" />
            </button>
          </div>

          <Link to="/jobs/workload" className="btn-secondary text-sm">
            Workload
          </Link>
          <div className="relative w-full max-w-xs sm:w-56">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input-field pl-9"
              placeholder="Search client or job…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <MetalTile
            tone="mint"
            kicker="Pipeline"
            value={`£${(moneyUnderManagement.openFee / 100).toLocaleString('en-GB')}`}
            hint={`${moneyUnderManagement.openCount} open jobs`}
            icon={<CurrencyPoundIcon className="h-4 w-4 text-emerald-600" />}
          />
          <MetalTile
            tone="rose"
            kicker="Overdue"
            value={`£${(moneyUnderManagement.overdueFee / 100).toLocaleString('en-GB')}`}
            hint={`${moneyUnderManagement.overdueCount} jobs late`}
            icon={<ExclamationTriangleIcon className="h-4 w-4 text-rose-600" />}
          />
          <MetalTile
            tone="sky"
            kicker="Completed"
            value={`£${(moneyUnderManagement.completeFee / 100).toLocaleString('en-GB')}`}
            hint={
              moneyUnderManagement.helpCount > 0
                ? `${moneyUnderManagement.helpCount} need help`
                : 'Board complete fees'
            }
            icon={<BriefcaseIcon className="h-4 w-4 text-sky-600" />}
          />
        </div>
      )}

      {jobs.length > 0 && <ClaraBoardPriorities />}

      {selectedIds.size > 0 && (
        <div className="metal-tile metal-tile--mint flex flex-wrap items-center gap-3 p-3">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {selectedIds.size} selected
          </span>
          <select
            className="input-field max-w-xs py-1.5 text-xs"
            disabled={bulkBusy}
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value as BoardColumn;
              if (v) void bulkMove(v);
              e.target.value = '';
            }}
          >
            <option value="">Bulk move to…</option>
            {COLUMN_ORDER.map((c) => (
              <option key={c} value={c}>
                {boardColumnLabel(c)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-xs font-medium text-slate-500 hover:underline"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {filtersActive && jobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>
            Showing{' '}
            <strong className="text-slate-800 dark:text-slate-200">{filteredJobs.length}</strong> of{' '}
            {jobs.length}
          </span>
          <button
            type="button"
            className="font-medium text-emerald-600 hover:underline"
            onClick={() => {
              setDueFilter('all');
              setAssigneeFilter('all');
              setQ('');
              searchParams.delete('filter');
              setSearchParams(searchParams, { replace: true });
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && jobs.length === 0 ? (
        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {COLUMN_ORDER.map((c) => (
            <div
              key={c}
              className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50"
            />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
          <BriefcaseIcon className="h-12 w-12 text-slate-300" />
          <p className="font-medium text-slate-600 dark:text-slate-300">No jobs yet</p>
          <p className="max-w-md text-sm text-slate-500">
            When a client accepts a proposal, a job appears here with phases and checklists —
            Engager-style delivery without leaving Engage Practice.
          </p>
          <Link to="/proposals" className="btn-accent mt-2">
            Go to proposals
          </Link>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
          <p className="font-medium text-slate-700 dark:text-slate-200">No jobs match filters</p>
          <button
            type="button"
            className="text-sm font-medium text-emerald-600 hover:underline"
            onClick={() => {
              setDueFilter('all');
              setAssigneeFilter('all');
              setQ('');
              searchParams.delete('filter');
              setSearchParams(searchParams, { replace: true });
            }}
          >
            Clear filters
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
                <tr>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Job</th>
                  <th className="px-4 py-2.5">Column</th>
                  <th className="px-4 py-2.5">Due</th>
                  <th className="px-4 py-2.5">Fee</th>
                  <th className="px-4 py-2.5">Progress</th>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">Move</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {listSorted.map((job) => {
                  const pct = phaseProgress(job);
                  const due = daysLabel(job.dueAt);
                  return (
                    <tr key={job.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/jobs/${job.id}`}
                          className="font-semibold text-slate-900 hover:text-emerald-600 dark:text-slate-50"
                        >
                          {job.client.name}
                        </Link>
                        <p className="text-2xs text-slate-400">{job.reference}</p>
                      </td>
                      <td className="max-w-[12rem] truncate px-4 py-2.5 text-slate-600 dark:text-slate-300">
                        {job.title}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusChip tone={boardColumnTone(job.boardColumn)}>
                          {boardColumnLabel(job.boardColumn)}
                        </StatusChip>
                      </td>
                      <td className="px-4 py-2.5">
                        {due ? (
                          <StatusChip tone={due.tone}>{due.text}</StatusChip>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <MoneyPill pence={job.proposedFeePence} />
                      </td>
                      <td className="px-4 py-2.5 min-w-[7rem]">
                        <div className="flex items-center gap-2">
                          <ProgressRing pct={pct} size={26} stroke={2.5} showLabel />
                          <ProgressBar pct={pct} className="min-w-[4rem] flex-1" height="h-1.5" />
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {job.assignee ? (
                          <StaffAvatar
                            firstName={job.assignee.firstName}
                            lastName={job.assignee.lastName}
                          />
                        ) : (
                          <span className="text-2xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          className="input-field py-1 text-xs"
                          value={job.boardColumn}
                          disabled={movingId === job.id}
                          onChange={(e) => void moveJob(job.id, e.target.value as BoardColumn)}
                        >
                          {COLUMN_ORDER.map((c) => (
                            <option key={c} value={c}>
                              {boardColumnLabel(c)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {COLUMN_ORDER.map((col) => {
            const meta =
              dueFilter === 'all' && assigneeFilter === 'all'
                ? columnsMeta.find((c) => c.id === col)
                : visibleColumnMeta.find((c) => c.id === col);
            const cards = byColumn[col] || [];
            const isDropTarget = dragOverCol === col;
            const chrome = boardColumnChrome(col);
            const colAvg =
              cards.length === 0
                ? 0
                : Math.round(cards.reduce((s, j) => s + phaseProgress(j), 0) / cards.length);
            return (
              <div
                key={col}
                className={`flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border shadow-sm transition-all ${chrome.accent} ${chrome.body} ${
                  isDropTarget ? 'ring-2 ring-emerald-400/50 scale-[1.01] shadow-md' : ''
                }`}
                onDragOver={(e) => onColumnDragOver(e, col)}
                onDragLeave={() => {
                  if (dragOverCol === col) setDragOverCol(null);
                }}
                onDrop={(e) => onColumnDrop(e, col)}
              >
                <div className={`relative px-3 py-2.5 ${chrome.header}`}>
                  <div className={`absolute inset-x-0 top-0 h-1 ${chrome.bar}`} />
                  <div className="mt-1 flex items-start justify-between gap-2">
                    <div>
                      <StatusChip tone={boardColumnTone(col)}>{boardColumnLabel(col)}</StatusChip>
                      <p className="mt-1.5 text-2xs font-medium text-slate-600 dark:text-slate-300">
                        <span className="tabular-nums font-bold text-slate-800 dark:text-slate-100">
                          {meta?.count ?? cards.length}
                        </span>{' '}
                        jobs
                        {meta ? (
                          <>
                            {' · '}
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                              £{((meta.feePence || 0) / 100).toLocaleString('en-GB')}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    {cards.length > 0 && (
                      <ProgressRing pct={colAvg} size={32} stroke={3} showLabel />
                    )}
                  </div>
                  {cards.length > 0 && (
                    <MetalProgress pct={colAvg} className="mt-2" height="h-1.5" tone="auto" />
                  )}
                </div>
                <div className="flex min-h-[8rem] flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {cards.map((job) => (
                    <JobCardView
                      key={job.id}
                      job={job}
                      movingId={movingId}
                      draggingId={draggingId}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onMove={(id, c) => void moveJob(id, c)}
                      selected={selectedIds.has(job.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-300/80 bg-white/50 p-4 text-center text-2xs text-slate-400 dark:border-slate-600 dark:bg-slate-900/30">
                      Drop jobs here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
