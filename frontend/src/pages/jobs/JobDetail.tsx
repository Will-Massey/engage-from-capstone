import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import {
  StatusChip,
  MoneyPill,
  ProgressRing,
  ProgressBar,
  StatTile,
  StaffAvatar,
  boardColumnTone,
  boardColumnLabel,
} from '../../components/ui/StatusChip';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Group phases that share a service prefix "ServiceName: Phase" */
function groupPhases(phases: any[] = []) {
  const groups = new Map<string, any[]>();
  for (const p of phases) {
    const m = String(p.name || '').match(/^(.+?):\s*(.+)$/);
    const service = m ? m[1] : 'General';
    const phaseName = m ? m[2] : p.name;
    if (!groups.has(service)) groups.set(service, []);
    groups.get(service)!.push({ ...p, phaseName });
  }
  return Array.from(groups.entries()).map(([service, items]) => {
    const done = items.filter((i) => i.isComplete).length;
    const pct =
      items.length === 0
        ? 0
        : Math.round(items.reduce((a, i) => a + (i.progressPct || 0), 0) / items.length);
    return { service, items, done, total: items.length, pct };
  });
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(30);
  const [ratePence, setRatePence] = useState(8500); // default £85/hr cost rate
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [packs, setPacks] = useState<
    Array<{ id: string; name: string; description: string; tone: string }>
  >([]);
  const [packId, setPackId] = useState('RECORDS_REQUEST');
  const [chasePreview, setChasePreview] = useState<{
    subject: string;
    bodyHtml: string;
    source?: string;
  } | null>(null);
  const [chaseBusy, setChaseBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [staff, setStaff] = useState<Array<{ id: string; firstName: string; lastName: string }>>(
    []
  );
  const [taskTitle, setTaskTitle] = useState('');
  const [taskBusy, setTaskBusy] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState('');
  const [notesBusy, setNotesBusy] = useState(false);
  const [activityMsg, setActivityMsg] = useState('');
  const [activityBusy, setActivityBusy] = useState(false);

  async function load() {
    try {
      const res = await apiClient.get(`/jobs/${id}`);
      setJob(res.data?.data ?? res.data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Failed to load job');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on job id only
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get('/jobs/meta/chase-packs');
        const list = res.data?.data ?? res.data ?? [];
        setPacks(list);
        if (list[0]?.id) setPackId(list[0].id);
      } catch {
        /* optional */
      }
      try {
        // reuse tenant users if endpoint exists
        const res = await apiClient.get('/auth/users').catch(() => null);
        const users = res?.data?.data ?? res?.data ?? [];
        if (Array.isArray(users) && users.length) {
          setStaff(
            users.map((u: any) => ({
              id: u.id,
              firstName: u.firstName,
              lastName: u.lastName,
            }))
          );
        }
      } catch {
        /* optional */
      }
    })();
  }, []);

  const groups = useMemo(() => groupPhases(job?.phases), [job?.phases]);

  useEffect(() => {
    if (!groups.length) return;
    setExpanded((prev) => {
      let changed = false;
      const next = { ...prev };
      // Expand first incomplete service once when job loads
      const hasAny = groups.some((g) => next[g.service] !== undefined);
      if (hasAny) return prev;
      let setOne = false;
      for (const g of groups) {
        next[g.service] = !setOne && g.done < g.total;
        if (next[g.service]) setOne = true;
        changed = true;
      }
      if (!setOne && groups[0]) {
        next[groups[0].service] = true;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [groups]);

  async function toggleChecklist(itemId: string, isDone: boolean) {
    await apiClient.patch(`/jobs/checklist/${itemId}`, { isDone });
    await load();
  }

  async function completePhase(phaseId: string, isComplete = true) {
    await apiClient.patch(`/jobs/phases/${phaseId}/complete`, { isComplete });
    await load();
  }

  async function logTime() {
    setSaving(true);
    try {
      await apiClient.post(`/jobs/${id}/time`, {
        minutes,
        note: note || undefined,
        ratePence: ratePence > 0 ? ratePence : undefined,
      });
      setNote('');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function postActivity() {
    if (!activityMsg.trim() || !id) return;
    setActivityBusy(true);
    try {
      await apiClient.post(`/jobs/${id}/activity`, { message: activityMsg.trim() });
      setActivityMsg('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e.message || 'Failed to post note');
    } finally {
      setActivityBusy(false);
    }
  }

  async function onUploadFile(file: File | null) {
    if (!file || !job) return;
    setUploading(true);
    try {
      const data = await fileToBase64(file);
      await apiClient.post('/jobs/files', {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data,
        clientId: job.clientId || job.client?.id,
        jobId: job.id,
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function downloadFile(fileId: string, name: string) {
    const res = await apiClient.get(`/jobs/files/${fileId}/download`, {
      responseType: 'blob',
    });
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function draftChase(useClara: boolean) {
    setChaseBusy(true);
    setError(null);
    try {
      if (useClara) {
        const res = await apiClient.post(`/jobs/${id}/clara/draft-chase`);
        const d = res.data?.data ?? res.data;
        setChasePreview({ subject: d.subject, bodyHtml: d.bodyHtml, source: d.source });
      } else {
        const res = await apiClient.post(`/jobs/${id}/chase`, { packId, send: false });
        const d = res.data?.data ?? res.data;
        setChasePreview({ subject: d.subject, bodyHtml: d.bodyHtml, source: 'pack' });
      }
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Draft failed');
    } finally {
      setChaseBusy(false);
    }
  }

  async function moveColumn(boardColumn: string) {
    const res = (await apiClient.patch(`/jobs/${id}/column`, { boardColumn })) as any;
    const nudge = res?.renewalNudge ?? res?.data?.renewalNudge;
    if (nudge?.message) {
      setError(null);
      // Surface renewal window as a soft success banner via chasePreview-style state
      setChasePreview({
        subject: 'Renewal window',
        bodyHtml: `<p>${nudge.message}</p><p><a href="/proposals/renewals">Open bulk renewals →</a></p>`,
        source: 'renewal',
      });
    }
    await load();
  }

  async function setAssignee(assigneeId: string) {
    await apiClient.patch(`/jobs/${id}`, {
      assigneeId: assigneeId || null,
    });
    await load();
  }

  async function addTask() {
    if (!taskTitle.trim() || !id) return;
    setTaskBusy(true);
    try {
      await apiClient.post(`/jobs/${id}/tasks`, { title: taskTitle.trim() });
      setTaskTitle('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Could not add task');
    } finally {
      setTaskBusy(false);
    }
  }

  async function tasksFromNotes() {
    if (!meetingNotes.trim() || !id) return;
    setNotesBusy(true);
    try {
      const res = (await apiClient.post(`/jobs/${id}/tasks/from-notes`, {
        notes: meetingNotes,
      })) as any;
      setMeetingNotes('');
      await load();
      const n = res?.data?.created ?? res?.created;
      if (n) {
        setChasePreview({
          subject: 'Tasks from notes',
          bodyHtml: `<p>Created ${n} task(s) from meeting notes.</p>`,
          source: 'notes',
        });
      }
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Could not create tasks from notes');
    } finally {
      setNotesBusy(false);
    }
  }

  async function toggleTask(taskId: string, isDone: boolean) {
    await apiClient.patch(`/jobs/tasks/${taskId}`, { isDone });
    await load();
  }

  async function openAccountFlowMesh() {
    try {
      const res = (await apiClient.post('/integrations/accountflow/handoff', {
        jobId: id,
        mode: 'create_and_open',
      })) as any;
      const d = res?.data ?? res;
      if (d?.deepLink) {
        window.location.assign(d.deepLink);
      } else {
        setError(d?.message || 'AccountFlow mesh unavailable');
      }
    } catch (e: any) {
      setError(e?.message || 'AccountFlow handoff failed');
    }
  }

  if (error && !job) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
    );
  }
  if (!job) {
    return <div className="card h-48 animate-pulse bg-slate-100" />;
  }

  const phasePct =
    job.phases?.length > 0
      ? Math.round(
          job.phases.reduce((a: number, p: any) => a + (p.progressPct || 0), 0) /
            job.phases.length
        )
      : 0;

  const fee = job.proposedFeePence || 0;
  const actual = job.actualPence || 0;
  const budget = job.budgetPence || 0;
  const marginPence = fee - actual;
  const marginPct = fee > 0 ? Math.round((marginPence / fee) * 100) : null;
  const totalMinutes =
    job.timeEntries?.reduce((a: number, t: any) => a + (t.minutes || 0), 0) || 0;
  const checklistDone =
    job.phases?.reduce(
      (a: number, p: any) => a + (p.checklistItems?.filter((c: any) => c.isDone).length || 0),
      0
    ) || 0;
  const checklistTotal =
    job.phases?.reduce((a: number, p: any) => a + (p.checklistItems?.length || 0), 0) || 0;

  const columns = [
    'REQUEST_RECORDS',
    'RECORDS_RECEIVED',
    'IN_PROGRESS',
    'HELP_NEEDED',
    'IN_REVIEW',
    'COMPLETE',
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Hero */}
      <div className="metal-tile metal-tile--mint p-5 sm:p-6">
        <span className="metal-specular" aria-hidden />
        <span className="metal-glare" aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link to="/jobs" className="font-medium text-emerald-600 hover:underline">
                ← Jobs board
              </Link>
              {job.client?.id && (
                <>
                  <span className="text-slate-300">·</span>
                  <Link
                    to={`/clients/${job.client.id}`}
                    className="font-medium text-slate-500 hover:text-emerald-600"
                  >
                    Client record
                  </Link>
                </>
              )}
              <span className="text-slate-300">·</span>
              <button
                type="button"
                className="font-medium text-amber-700 hover:underline dark:text-amber-300"
                onClick={() => void openAccountFlowMesh()}
                title="Mock mesh only — production AccountFlow not contacted"
              >
                AccountFlow mesh
              </button>
              {job.accountFlowWorkId && (
                <StatusChip tone="warning">AF {job.accountFlowSyncStatus || 'linked'}</StatusChip>
              )}
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {job.client?.name}
            </h1>
            <p className="mt-0.5 max-w-xl text-sm text-slate-500">{job.title}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusChip tone={boardColumnTone(job.boardColumn)}>
                {boardColumnLabel(job.boardColumn)}
              </StatusChip>
              <span className="text-xs font-medium text-slate-400">{job.reference}</span>
              {job.proposal && (
                <Link
                  to={`/proposals/${job.proposal.id}`}
                  className="text-xs font-medium text-emerald-600 hover:underline"
                >
                  {job.proposal.reference}
                </Link>
              )}
              {job.dueAt && (
                <StatusChip
                  tone={
                    new Date(job.dueAt) < new Date()
                      ? 'danger'
                      : job.deadlineKind === 'STATUTORY'
                        ? 'info'
                        : 'warning'
                  }
                >
                  Due {new Date(job.dueAt).toLocaleDateString('en-GB')}
                  {job.deadlineKind === 'STATUTORY' ? ' · statutory' : ''}
                </StatusChip>
              )}
              {checklistTotal > 0 && (
                <StatusChip tone={checklistDone === checklistTotal ? 'success' : 'neutral'}>
                  {checklistDone}/{checklistTotal} checks
                </StatusChip>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <ProgressRing pct={phasePct} size={56} stroke={4} />
              <p className="mt-1 text-2xs text-slate-400">{phasePct}%</p>
            </div>
            <div className="space-y-1 text-right text-sm">
              <div className="text-xs text-slate-500">Proposed fee</div>
              <MoneyPill pence={fee} />
              <div className="text-xs text-slate-400">
                Logged · £{(actual / 100).toLocaleString('en-GB')}
                {totalMinutes > 0 ? ` · ${Math.round(totalMinutes / 60)}h ${totalMinutes % 60}m` : ''}
              </div>
            </div>
            {job.assignee && (
              <StaffAvatar firstName={job.assignee.firstName} lastName={job.assignee.lastName} />
            )}
          </div>
        </div>

        {/* Overall completion */}
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-700">
          <ProgressBar
            pct={phasePct}
            height="h-3"
            showPct
            label="Overall completion"
            className="mb-3"
          />
          {checklistTotal > 0 && (
            <ProgressBar
              pct={Math.round((checklistDone / checklistTotal) * 100)}
              height="h-2"
              showPct
              label={`Checklist ${checklistDone}/${checklistTotal}`}
            />
          )}
        </div>

        {/* Profitability strip — fee vs time cost */}
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <StatTile
            tone="success"
            label="Fee"
            value={`£${(fee / 100).toLocaleString('en-GB')}`}
          />
          <StatTile
            tone="info"
            label="Time cost"
            value={`£${(actual / 100).toLocaleString('en-GB')}`}
            hint={budget > 0 ? `Budget £${(budget / 100).toLocaleString('en-GB')}` : undefined}
          />
          <StatTile
            tone={
              marginPence < 0 ? 'danger' : marginPct !== null && marginPct < 30 ? 'warning' : 'mint'
            }
            label="Margin"
            value={
              <>
                £{(marginPence / 100).toLocaleString('en-GB')}
                {marginPct !== null ? (
                  <span className="ml-1 text-sm font-semibold opacity-80">({marginPct}%)</span>
                ) : null}
              </>
            }
          />
          <StatTile
            tone="violet"
            label="Time logged"
            value={
              totalMinutes === 0
                ? '—'
                : totalMinutes >= 60
                  ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
                  : `${totalMinutes}m`
            }
            hint={`${job.timeEntries?.length || 0} entries`}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 pt-4 dark:border-slate-700">
          <label className="text-xs text-slate-500">
            Board column
            <select
              className="input-field mt-1 min-w-[10rem]"
              value={job.boardColumn}
              onChange={(e) => void moveColumn(e.target.value)}
            >
              {columns.map((c) => (
                <option key={c} value={c}>
                  {boardColumnLabel(c)}
                </option>
              ))}
            </select>
          </label>
          {staff.length > 0 && (
            <label className="text-xs text-slate-500">
              Assignee
              <select
                className="input-field mt-1 min-w-[10rem]"
                value={job.assigneeId || ''}
                onChange={(e) => void setAssignee(e.target.value)}
              >
                <option value="">Unassigned</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Phases grouped by service */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Work by service
            </h2>
            <span className="text-xs text-slate-400">
              {groups.reduce((a, g) => a + g.done, 0)}/
              {groups.reduce((a, g) => a + g.total, 0)} phases done
            </span>
          </div>

          {groups.map((g) => {
            const open = expanded[g.service];
            return (
              <section key={g.service} className="card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [g.service]: !e[g.service] }))
                  }
                >
                  {open ? (
                    <ChevronDownIcon className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 text-slate-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-50 truncate">
                      {g.service}
                    </p>
                    <p className="text-xs text-slate-500">
                      {g.done}/{g.total} phases · {g.pct}%
                    </p>
                    <ProgressBar pct={g.pct} className="mt-1.5 max-w-xs" height="h-1.5" />
                  </div>
                  <ProgressRing pct={g.pct} size={40} stroke={3.5} showLabel />
                  {g.done === g.total && g.total > 0 && (
                    <CheckCircleIcon className="h-5 w-5 text-emerald-500" />
                  )}
                </button>
                {open && (
                  <div className="space-y-3 border-t border-slate-100 px-4 py-3 dark:border-slate-700">
                    {g.items.map((phase: any) => (
                      <div
                        key={phase.id}
                        className="rounded-lg border border-slate-200/80 p-3 dark:border-slate-700"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {phase.phaseName}
                          </h3>
                          <div className="flex items-center gap-1.5">
                            {!phase.isComplete && (phase.checklistItems?.length || 0) > 0 && (
                              <button
                                type="button"
                                className="text-2xs font-medium text-emerald-600 hover:underline"
                                onClick={() => void completePhase(phase.id, true)}
                              >
                                Complete all
                              </button>
                            )}
                            {phase.isComplete && (
                              <button
                                type="button"
                                className="text-2xs font-medium text-slate-500 hover:underline"
                                onClick={() => void completePhase(phase.id, false)}
                              >
                                Reopen
                              </button>
                            )}
                            <StatusChip tone={phase.isComplete ? 'success' : 'neutral'}>
                              {phase.progressPct}%
                            </StatusChip>
                          </div>
                        </div>
                        <ul className="space-y-1.5">
                          {phase.checklistItems?.map((item: any) => (
                            <li key={item.id} className="flex items-start gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                checked={item.isDone}
                                onChange={(e) =>
                                  void toggleChecklist(item.id, e.target.checked)
                                }
                              />
                              <span
                                className={
                                  item.isDone
                                    ? 'text-slate-400 line-through'
                                    : 'text-slate-700 dark:text-slate-200'
                                }
                              >
                                {item.label}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Sidebar actions */}
        <div className="space-y-4">
          <section className="metal-tile p-4">
            <span className="metal-kicker">Tasks</span>
            <h2 className="mt-1 mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
              Team tasks
            </h2>
            <div className="mb-3 space-y-2">
              <textarea
                className="input-field min-h-[4.5rem] text-xs"
                placeholder="Paste meeting notes (one bullet per line)…"
                value={meetingNotes}
                onChange={(e) => setMeetingNotes(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary w-full text-xs"
                disabled={notesBusy || !meetingNotes.trim()}
                onClick={() => void tasksFromNotes()}
              >
                {notesBusy ? 'Creating…' : 'Clara: notes → tasks'}
              </button>
            </div>
            <div className="mb-3 flex gap-2">
              <input
                className="input-field flex-1 text-sm"
                placeholder="Add a task…"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addTask();
                }}
              />
              <button
                type="button"
                className="btn-accent text-sm shrink-0"
                disabled={taskBusy || !taskTitle.trim()}
                onClick={() => void addTask()}
              >
                Add
              </button>
            </div>
            <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
              {(job.tasks || []).map((t: any) => (
                <li key={t.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-slate-300 text-emerald-600"
                    checked={!!t.isDone}
                    onChange={(e) => void toggleTask(t.id, e.target.checked)}
                  />
                  <span
                    className={
                      t.isDone ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'
                    }
                  >
                    {t.title}
                  </span>
                </li>
              ))}
              {!(job.tasks || []).length && (
                <li className="text-xs text-slate-400">No tasks yet — add one above.</li>
              )}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Client chase
            </h2>
            <label className="block text-xs text-slate-500 mb-2">
              Pack
              <select
                className="input-field mt-1"
                value={packId}
                onChange={(e) => setPackId(e.target.value)}
              >
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="mb-2 text-2xs text-slate-400">
              {packs.find((p) => p.id === packId)?.description}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={chaseBusy}
                onClick={() => void draftChase(false)}
              >
                {chaseBusy ? 'Working…' : 'Draft pack email'}
              </button>
              <button
                type="button"
                className="btn-accent text-sm"
                disabled={chaseBusy}
                onClick={() => void draftChase(true)}
              >
                Clara draft chase
              </button>
            </div>
            {chasePreview && (
              <div className="mt-3 rounded-lg border border-emerald-200/60 bg-emerald-50/40 p-3 text-xs dark:border-emerald-800 dark:bg-emerald-950/20">
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {chasePreview.subject}
                </p>
                {chasePreview.source && (
                  <p className="mt-0.5 text-emerald-700/80 dark:text-emerald-400/80">
                    via {chasePreview.source}
                  </p>
                )}
                <div
                  className="mt-2 prose prose-xs max-w-none dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: chasePreview.bodyHtml }}
                />
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Log time
            </h2>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-slate-500">
                  Minutes
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    className="input-field mt-1"
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  Rate £/hr
                  <input
                    type="number"
                    min={0}
                    step={5}
                    className="input-field mt-1"
                    value={Math.round(ratePence / 100)}
                    onChange={(e) => setRatePence(Math.round(Number(e.target.value) * 100))}
                  />
                </label>
              </div>
              <p className="text-2xs text-slate-400">
                Est. cost this entry:{' '}
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  £{((minutes / 60) * (ratePence / 100)).toFixed(2)}
                </span>
              </p>
              <label className="block text-xs text-slate-500">
                Note
                <input
                  className="input-field mt-1"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <button
                type="button"
                className="btn-accent w-full"
                disabled={saving}
                onClick={() => void logTime()}
              >
                {saving ? 'Saving…' : 'Add time entry'}
              </button>
            </div>
            <ul className="mt-4 max-h-40 space-y-2 overflow-y-auto text-xs text-slate-600">
              {job.timeEntries?.map((t: any) => (
                <li
                  key={t.id}
                  className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-700"
                >
                  <span>
                    {t.minutes}m
                    {t.user ? ` · ${t.user.firstName}` : ''}
                    {t.amountPence
                      ? ` · £${(t.amountPence / 100).toLocaleString('en-GB')}`
                      : ''}
                  </span>
                  <span className="text-slate-400">
                    {new Date(t.createdAt).toLocaleDateString('en-GB')}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Files
            </h2>
            <label className="btn-secondary mb-3 flex w-full cursor-pointer justify-center text-sm">
              {uploading ? 'Uploading…' : 'Upload file'}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void onUploadFile(e.target.files?.[0] || null)}
              />
            </label>
            <ul className="max-h-40 space-y-2 overflow-y-auto text-xs">
              {job.portalFiles?.length ? (
                job.portalFiles.map((f: any) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="truncate text-left text-emerald-600 hover:underline"
                      onClick={() => void downloadFile(f.id, f.name)}
                    >
                      {f.name}
                    </button>
                    <span className="shrink-0 text-slate-400">
                      {Math.round((f.sizeBytes || 0) / 1024)}kb
                    </span>
                  </li>
                ))
              ) : (
                <li className="text-slate-400">No files yet</li>
              )}
            </ul>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Activity
            </h2>
            <div className="mb-3 space-y-2">
              <textarea
                className="input-field min-h-[4rem] text-sm"
                placeholder="Add a note… use @FirstName to mention a colleague"
                value={activityMsg}
                onChange={(e) => setActivityMsg(e.target.value)}
              />
              {staff.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {staff.slice(0, 8).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-2xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-600 dark:bg-slate-800"
                      onClick={() =>
                        setActivityMsg((m) =>
                          `${m}${m && !m.endsWith(' ') ? ' ' : ''}@${u.firstName} `.trimStart()
                        )
                      }
                    >
                      @{u.firstName}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="btn-secondary w-full text-sm"
                disabled={activityBusy || !activityMsg.trim()}
                onClick={() => void postActivity()}
              >
                {activityBusy ? 'Posting…' : 'Post note'}
              </button>
            </div>
            <ul className="max-h-56 space-y-2 overflow-y-auto text-xs">
              {job.activities?.map((a: any) => {
                let mentions: Array<{ id: string; name: string }> = [];
                try {
                  const meta = JSON.parse(a.metadata || '{}');
                  mentions = meta.mentions || [];
                } catch {
                  /* ignore */
                }
                return (
                  <li
                    key={a.id}
                    className="border-b border-slate-100 pb-2 dark:border-slate-700"
                  >
                    <div className="font-medium text-slate-700 dark:text-slate-200">
                      {a.message}
                    </div>
                    {mentions.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {mentions.map((m) => (
                          <span
                            key={m.id}
                            className="rounded bg-emerald-50 px-1.5 py-0.5 text-2xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            @{m.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-slate-400">
                      {a.actor
                        ? `${a.actor.firstName} ${a.actor.lastName} · `
                        : ''}
                      {new Date(a.createdAt).toLocaleString('en-GB')}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
