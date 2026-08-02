import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon,
  ShieldCheckIcon,
  BuildingOfficeIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { StatusChip } from '../../components/ui/StatusChip';

/**
 * In-app AccountFlow mesh sandbox.
 * Shows mock AF client/work created by the mesh — production AF is never opened.
 */
export default function AccountFlowSandbox() {
  const [params] = useSearchParams();
  const afClient = params.get('afClient');
  const afWork = params.get('afWork');
  const [status, setStatus] = useState<any>(null);
  const [state, setState] = useState<{ clients: any[]; work: any[] }>({ clients: [], work: [] });
  const [detail, setDetail] = useState<{ client?: any; work?: any }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = (await apiClient.get('/integrations/accountflow/status')) as any;
        setStatus(s?.data ?? s);
        const st = (await apiClient.get('/integrations/accountflow/sandbox/state')) as any;
        const d = st?.data ?? st;
        setState({ clients: d.clients || [], work: d.work || [] });
      } catch (e: any) {
        setError(e?.message || 'Failed to load mesh status');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!afClient && !afWork) return;
      try {
        const next: { client?: any; work?: any } = {};
        if (afClient) {
          const c = (await apiClient.get(`/integrations/accountflow/sandbox/clients/${afClient}`)) as any;
          next.client = c?.data ?? c;
        }
        if (afWork) {
          const w = (await apiClient.get(`/integrations/accountflow/sandbox/work/${afWork}`)) as any;
          next.work = w?.data ?? w;
        }
        setDetail(next);
      } catch {
        /* optional deep link */
      }
    })();
  }, [afClient, afWork]);

  async function linkFromJobs() {
    setBusy(true);
    setError(null);
    try {
      const jobsRes = (await apiClient.get('/jobs')) as any;
      const jobs = jobsRes?.data?.jobs ?? jobsRes?.jobs ?? [];
      const first = jobs[0];
      if (!first) {
        setError('No jobs to link — accept a proposal first.');
        return;
      }
      const handoff = (await apiClient.post('/integrations/accountflow/handoff', {
        jobId: first.id,
        mode: 'create_and_open',
      })) as any;
      const d = handoff?.data ?? handoff;
      if (d?.deepLink) {
        window.location.assign(d.deepLink);
      }
    } catch (e: any) {
      setError(e?.message || 'Handoff failed');
    } finally {
      setBusy(false);
    }
  }

  async function linkAllOpenJobs() {
    setBusy(true);
    setError(null);
    try {
      const res = (await apiClient.post('/integrations/accountflow/handoff-open-jobs', {})) as any;
      const d = res?.data ?? res;
      setError(null);
      // refresh lists
      const st = (await apiClient.get('/integrations/accountflow/sandbox/state')) as any;
      const stateData = st?.data ?? st;
      setState({ clients: stateData.clients || [], work: stateData.work || [] });
      alert(res?.message || `Linked ${d?.linked ?? 0} jobs (${d?.mode || 'mock'})`);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Batch handoff failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-4 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-orange-950/20">
        <div className="flex items-start gap-3">
          <ShieldCheckIcon className="h-6 w-6 shrink-0 text-amber-600" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              AccountFlow mesh sandbox
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              This is a <strong>safe mock</strong> of Capstone AccountFlow linkage. Production
              AccountFlow is <strong>not</strong> contacted or modified. Clone for future local
              testing: <code className="text-xs">accountflow-practice</code> · branch{' '}
              <code className="text-xs">feat/mesh-sandbox</code>.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {status && (
        <div className="card space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={status.available ? 'success' : 'neutral'}>
              {status.mode}
            </StatusChip>
            <StatusChip tone="warning">prod AF protected</StatusChip>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{status.message}</p>
          {status.isolation && (
            <p className="text-xs text-slate-500">{status.isolation}</p>
          )}
        </div>
      )}

      {(detail.client || detail.work) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {detail.client && (
            <div className="card border-sky-100 p-4 dark:border-sky-900/40">
              <div className="flex items-center gap-2 text-sky-700 dark:text-sky-300">
                <BuildingOfficeIcon className="h-5 w-5" />
                <h2 className="font-semibold">AF client (mock)</h2>
              </div>
              <p className="mt-2 font-medium text-slate-900 dark:text-white">{detail.client.name}</p>
              <p className="text-xs text-slate-500">{detail.client.id}</p>
              <p className="text-sm text-slate-600">{detail.client.contactEmail}</p>
              <Link
                to={`/clients/${detail.client.engageClientId}`}
                className="mt-3 inline-flex text-sm font-medium text-emerald-600 hover:underline"
              >
                Open Engage client →
              </Link>
            </div>
          )}
          {detail.work && (
            <div className="card border-violet-100 p-4 dark:border-violet-900/40">
              <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
                <BriefcaseIcon className="h-5 w-5" />
                <h2 className="font-semibold">AF work (mock)</h2>
              </div>
              <p className="mt-2 font-medium text-slate-900 dark:text-white">{detail.work.title}</p>
              <p className="text-xs text-slate-500">{detail.work.id}</p>
              <StatusChip tone="info">{detail.work.status}</StatusChip>
              {detail.work.engageJobId && (
                <Link
                  to={`/jobs/${detail.work.engageJobId}`}
                  className="mt-3 inline-flex text-sm font-medium text-emerald-600 hover:underline"
                >
                  Open Engage job →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Mock AF state (this tenant)
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {state.clients.length} clients · {state.work.length} work items
        </p>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
          {state.work.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{w.title}</p>
                <p className="text-xs text-slate-400">{w.id}</p>
              </div>
              <div className="flex gap-2">
                {w.engageJobId && (
                  <Link to={`/jobs/${w.engageJobId}`} className="text-xs font-medium text-emerald-600">
                    Job
                  </Link>
                )}
                <Link
                  to={`/integrations/accountflow/sandbox?afWork=${w.id}&afClient=${w.clientId}`}
                  className="text-xs font-medium text-sky-600"
                >
                  Focus
                </Link>
              </div>
            </li>
          ))}
          {state.work.length === 0 && (
            <li className="py-4 text-sm text-slate-500">
              No linked work yet. Spawn/accept a job or run a handoff.
            </li>
          )}
        </ul>
        <button
          type="button"
          className="btn-accent mt-3 inline-flex items-center gap-1 text-sm"
          disabled={busy}
          onClick={() => void linkFromJobs()}
        >
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          {busy ? 'Linking…' : 'Link first open job (mock)'}
        </button>
        <button
          type="button"
          className="btn-accent inline-flex items-center gap-2"
          disabled={busy}
          onClick={() => void linkAllOpenJobs()}
        >
          {busy ? 'Linking…' : 'Link all open jobs (batch mock)'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link to="/integrations" className="btn-secondary">
          Integrations hub
        </Link>
        <Link to="/jobs" className="btn-secondary">
          Jobs board
        </Link>
        <Link to="/settings" className="btn-secondary">
          Settings
        </Link>
      </div>
    </div>
  );
}
