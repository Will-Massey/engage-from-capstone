import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DocumentTextIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { StatusChip } from '../../components/ui/StatusChip';
import { MetalCard } from '../../components/ui/MetalTile';

type FormField = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
};

type FormTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  fields: FormField[];
  isActive: boolean;
};

type FormAssignment = {
  id: string;
  templateId: string;
  templateName: string;
  clientId: string;
  clientName?: string;
  status: 'pending' | 'submitted';
  assignedAt: string;
  submittedAt?: string | null;
  dueAt?: string | null;
  answers?: Record<string, unknown>;
};

type ClientRow = { id: string; name: string; contactEmail?: string };

export default function PracticeForms() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [assignments, setAssignments] = useState<FormAssignment[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [clientSearch, setClientSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'submitted' | 'overdue'>(
    'all'
  );
  const [dueInDays, setDueInDays] = useState(7);
  const [viewAssignment, setViewAssignment] = useState<FormAssignment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tplRes, asgRes, cliRes] = await Promise.all([
        apiClient.get('/forms/templates') as Promise<any>,
        apiClient.get('/forms/assignments') as Promise<any>,
        apiClient.get('/clients?limit=100') as Promise<any>,
      ]);
      const tpls = tplRes?.data?.templates || tplRes?.templates || [];
      setTemplates(tpls);
      if (!selectedTemplateId && tpls[0]) setSelectedTemplateId(tpls[0].id);
      setAssignments(asgRes?.data?.assignments || asgRes?.assignments || []);
      const cl = cliRes?.data || cliRes || [];
      setClients(Array.isArray(cl) ? cl : cl.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Failed to load forms');
    } finally {
      setLoading(false);
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.contactEmail || '').toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  const filteredAssignments = useMemo(() => {
    const now = Date.now();
    if (statusFilter === 'all') return assignments;
    if (statusFilter === 'overdue') {
      return assignments.filter(
        (a) =>
          a.status === 'pending' && a.dueAt && new Date(a.dueAt).getTime() < now
      );
    }
    return assignments.filter((a) => a.status === statusFilter);
  }, [assignments, statusFilter]);

  function exportAssignmentsCsv() {
    const rows = [
      ['Template', 'Client', 'Status', 'Assigned', 'Due', 'Submitted', 'Answers JSON'],
      ...filteredAssignments.map((a) => [
        a.templateName,
        a.clientName || a.clientId,
        a.status,
        a.assignedAt,
        a.dueAt || '',
        a.submittedAt || '',
        a.answers ? JSON.stringify(a.answers) : '',
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `form-assignments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('CSV exported');
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  function toggleClient(id: string) {
    setSelectedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedClientIds(new Set(filteredClients.map((c) => c.id)));
  }

  async function assignSelected() {
    if (!selectedTemplateId || selectedClientIds.size === 0) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = (await apiClient.post('/forms/assign', {
        templateId: selectedTemplateId,
        clientIds: [...selectedClientIds],
        dueInDays,
      })) as any;
      setMsg(
        res?.message || `Assigned to ${res?.data?.assigned ?? selectedClientIds.size} clients`
      );
      setSelectedClientIds(new Set());
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Assign failed');
    } finally {
      setBusy(false);
    }
  }

  async function assignAllActive() {
    if (!selectedTemplateId) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = (await apiClient.post('/forms/assign-all-active', {
        templateId: selectedTemplateId,
        dueInDays,
      })) as any;
      setMsg(res?.message || 'Bulk assign complete');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Bulk assign failed');
    } finally {
      setBusy(false);
    }
  }

  async function resendPending() {
    if (!selectedTemplateId) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = (await apiClient.post('/forms/resend-pending', {
        templateId: selectedTemplateId,
        dueInDays,
      })) as any;
      setMsg(res?.message || 'Re-sent');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Resend failed');
    } finally {
      setBusy(false);
    }
  }

  async function remindOverdue() {
    setBusy(true);
    setMsg(null);
    try {
      const res = (await apiClient.post('/forms/remind-overdue', {})) as any;
      setMsg(res?.message || 'Reminders recorded');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Remind failed');
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = assignments.filter((a) => a.status === 'pending').length;
  const submittedCount = assignments.filter((a) => a.status === 'submitted').length;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-48" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-24" />
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
            <DocumentTextIcon className="h-6 w-6 text-emerald-500" aria-hidden />
            Forms
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-slate-500">
            UK form packs — assign to many clients at once. Clients complete them in the portal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm" onClick={() => void load()}>
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
          <Link to="/inbox" className="btn-ghost text-sm">
            Inbox
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetalCard tone="mint" className="p-4">
          <p className="metal-kicker">Templates</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{templates.length}</p>
        </MetalCard>
        <MetalCard tone="amber" className="p-4">
          <p className="metal-kicker">Pending</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{pendingCount}</p>
        </MetalCard>
        <MetalCard tone="sky" className="p-4">
          <p className="metal-kicker">Submitted</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{submittedCount}</p>
        </MetalCard>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Template library */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Form library
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const active = t.id === selectedTemplateId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTemplateId(t.id)}
                className={`path-tile text-left ${
                  active
                    ? 'border-emerald-400 ring-2 ring-emerald-400/30 dark:border-emerald-600'
                    : ''
                }`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <DocumentTextIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {t.name}
                    </span>
                    <StatusChip tone="mint">{t.category}</StatusChip>
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500 line-clamp-2">
                    {t.description}
                  </span>
                  <span className="mt-1 block text-2xs text-slate-400">
                    {t.fields.length} fields
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {selectedTemplate && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              Preview · {selectedTemplate.name}
            </p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {selectedTemplate.fields.map((f) => (
                <li key={f.id} className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{f.label}</span>
                  <span className="text-slate-400"> · {f.type}</span>
                  {f.required ? <span className="text-rose-500"> *</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Bulk assign */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="metal-tile p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1]">
            <div className="flex items-center gap-2">
              <UserGroupIcon className="h-5 w-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Assign to clients
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Select clients, then assign the template above. Pending duplicates are skipped.
            </p>
            <input
              className="input-field mt-3 text-sm"
              placeholder="Filter clients…"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={selectAllVisible}>
                Select visible ({filteredClients.length})
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setSelectedClientIds(new Set())}
              >
                Clear
              </button>
            </div>
            <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
              {filteredClients.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedClientIds.has(c.id)}
                      onChange={() => toggleClient(c.id)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">
                      {c.name}
                    </span>
                    <span className="truncate text-xs text-slate-400">{c.contactEmail}</span>
                  </label>
                </li>
              ))}
              {filteredClients.length === 0 && (
                <li className="text-sm text-slate-500">No clients match.</li>
              )}
            </ul>
            <label className="mt-3 block text-xs text-slate-500">
              Due in (days)
              <input
                type="number"
                min={1}
                max={90}
                className="input-field mt-1 w-24 text-sm"
                value={dueInDays}
                onChange={(e) => setDueInDays(Number(e.target.value) || 7)}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={busy || !selectedTemplateId || selectedClientIds.size === 0}
                onClick={() => void assignSelected()}
              >
                {busy ? 'Assigning…' : `Assign to ${selectedClientIds.size || 0} selected`}
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={busy || !selectedTemplateId}
                onClick={() => void assignAllActive()}
              >
                Assign all active
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={busy || !selectedTemplateId}
                onClick={() => void resendPending()}
              >
                Re-send pending
              </button>
              <button
                type="button"
                className="btn-ghost text-sm"
                disabled={busy}
                onClick={() => void remindOverdue()}
              >
                Mark overdue reminders
              </button>
            </div>
          </div>
        </div>

        <div className="metal-tile p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Assignment tracker
              </h2>
              <div className="flex flex-wrap items-center gap-1">
                {(['all', 'pending', 'overdue', 'submitted'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold ${
                      statusFilter === s
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                    }`}
                    onClick={() => setStatusFilter(s)}
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn-ghost btn-sm !min-h-8 !py-1 text-2xs"
                  onClick={() => exportAssignmentsCsv()}
                >
                  Export CSV
                </button>
              </div>
            </div>
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {filteredAssignments.length === 0 && (
                <li className="text-sm text-slate-500">No assignments yet.</li>
              )}
              {filteredAssignments.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100">
                      {a.templateName}
                    </p>
                    <Link
                      to={`/clients/${a.clientId}`}
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      {a.clientName || a.clientId.slice(0, 8)}
                    </Link>
                    {a.dueAt && (
                      <p className="text-2xs text-amber-700">
                        Due {new Date(a.dueAt).toLocaleDateString('en-GB')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === 'submitted' ? (
                      <StatusChip tone="success">
                        <CheckCircleIcon className="h-3 w-3" /> Submitted
                      </StatusChip>
                    ) : (
                      <StatusChip tone="warning">
                        <ClockIcon className="h-3 w-3" /> Pending
                      </StatusChip>
                    )}
                    {(a.status === 'submitted' || a.answers) && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm !min-h-8 !py-1 text-2xs"
                        onClick={() => setViewAssignment(a)}
                      >
                        View
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {viewAssignment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewAssignment(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {viewAssignment.templateName}
            </h3>
            <p className="text-sm text-slate-500">
              {viewAssignment.clientName || viewAssignment.clientId}
              {viewAssignment.submittedAt
                ? ` · submitted ${new Date(viewAssignment.submittedAt).toLocaleString('en-GB')}`
                : ''}
            </p>
            <dl className="mt-4 space-y-2">
              {viewAssignment.answers && Object.keys(viewAssignment.answers).length > 0 ? (
                Object.entries(viewAssignment.answers).map(([k, v]) => (
                  <div key={k} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {k}
                    </dt>
                    <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">
                      {typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '—')}
                    </dd>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No answers stored for this assignment.</p>
              )}
            </dl>
            <button
              type="button"
              className="btn-primary mt-4 text-sm"
              onClick={() => setViewAssignment(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
