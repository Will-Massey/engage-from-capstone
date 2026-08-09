import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  DocumentTextIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  XCircleIcon,
  ArrowRightIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
  ExclamationCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { monthlyEquivalentFor } from '@shared/pricingEngine';

interface PortalProposal {
  id: string;
  reference: string;
  title: string;
  status: string;
  total: number;
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  validUntil: string;
  sentAt: string;
  viewedAt: string;
  acceptedAt: string;
  declinedAt: string;
  createdAt: string;
  services: Array<{
    id: string;
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    vatRate: number;
    vatAmount: number;
    grossTotal: number;
    billingFrequency: string;
    priceDisplayMode: string;
  }>;
  canView: boolean;
}

interface PortalJob {
  id: string;
  reference: string;
  title: string;
  boardColumn: string;
  dueAt: string | null;
  deadlineKind: string;
  proposedFee: number;
  progressPct: number;
  phases: Array<{ id: string; name: string; isComplete: boolean; progressPct: number }>;
}

interface PortalFileMeta {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  jobId: string | null;
}

interface PortalDocRequestItem {
  id: string;
  name: string;
  required: boolean;
  status: 'PENDING' | 'RECEIVED';
}

interface PortalDocRequest {
  id: string;
  title: string;
  message: string | null;
  createdAt: string;
  items: PortalDocRequestItem[];
}

interface PortalData {
  client: {
    id: string;
    name: string;
    contactName: string;
    contactEmail: string;
  };
  practice: {
    name: string;
    primaryColor: string;
    logo: string;
  };
  proposals: PortalProposal[];
  jobs?: PortalJob[];
  files?: PortalFileMeta[];
  documentRequests?: PortalDocRequest[];
}

const statusConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  SENT: {
    label: 'Sent',
    icon: EnvelopeIcon,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
  },
  VIEWED: {
    label: 'Viewed',
    icon: EyeIcon,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
  ACCEPTED: {
    label: 'Accepted',
    icon: CheckCircleIcon,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-900/20',
  },
  DECLINED: {
    label: 'Declined',
    icon: XCircleIcon,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
  EXPIRED: {
    label: 'Expired',
    icon: ClockIcon,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-900/20',
  },
  WITHDRAWN: {
    label: 'Withdrawn',
    icon: ClockIcon,
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
  ARCHIVED: {
    label: 'Archived',
    icon: ClockIcon,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-900/20',
  },
  LOST: {
    label: 'Lost',
    icon: XCircleIcon,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.SENT;
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

function ProposalCard({
  proposal,
  practiceName,
  portalToken,
}: {
  proposal: PortalProposal;
  practiceName: string;
  portalToken: string;
}) {
  const navigate = useNavigate();
  const [isOpening, setIsOpening] = useState(false);

  const canView = proposal.canView;
  const isActionable = proposal.status === 'SENT' || proposal.status === 'VIEWED';

  // Calculate monthly equivalent (one-offs excluded — shown separately below)
  const monthlyEquivalent = proposal.services.reduce(
    (sum: number, s) =>
      sum + monthlyEquivalentFor(s.grossTotal || 0, s.billingFrequency || 'MONTHLY'),
    0
  );

  const oneOffTotal = proposal.services.reduce((sum: number, s) => {
    const freq = s.billingFrequency || 'MONTHLY';
    const gross = s.grossTotal || 0;
    return freq === 'ONE_TIME' ? sum + gross : sum;
  }, 0);

  const handleView = async () => {
    if (!canView || isOpening) return;
    setIsOpening(true);
    try {
      const response = (await apiClient.get(
        `/proposals/portal/${portalToken}/proposals/${proposal.id}/view-link`
      )) as any;
      if (response.success && response.data?.viewPath) {
        navigate(response.data.viewPath);
      }
    } catch {
      // Link unavailable or expired — leave the card as-is
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">{proposal.title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{proposal.reference}</p>
        </div>
        <StatusBadge status={proposal.status} />
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
          {formatCurrency(monthlyEquivalent)}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">/month</span>
        {oneOffTotal > 0 && (
          <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">
            + {formatCurrency(oneOffTotal)} one-off
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p>
            {proposal.services.length} service{proposal.services.length !== 1 ? 's' : ''}
          </p>
          <p>Valid until {formatDate(proposal.validUntil)}</p>
        </div>

        {canView && isActionable && (
          <button
            onClick={handleView}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            View & Sign
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        )}

        {canView && !isActionable && (
          <button
            onClick={handleView}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors"
          >
            View Details
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    bankStatementsReady: false,
    bookkeepingSoftware: '',
    vatScheme: '',
    payroll: false,
    notes: '',
    contactPhone: '',
  });
  const [formSubmittedAt, setFormSubmittedAt] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [portalTasks, setPortalTasks] = useState<
    Array<{
      id: string;
      title: string;
      done: boolean;
      dueAt: string | null;
      from: string;
    }>
  >([]);
  const [portalMessages, setPortalMessages] = useState<
    Array<{ id: string; body: string; createdAt: string; from: string; authorName?: string }>
  >([]);
  const [msgDraft, setMsgDraft] = useState('');
  const [taskDraft, setTaskDraft] = useState('');
  const [osBusy, setOsBusy] = useState(false);
  const [osMsg, setOsMsg] = useState<string | null>(null);
  const [assignedForms, setAssignedForms] = useState<
    Array<{
      id: string;
      templateName: string;
      description: string;
      status: string;
      fields: Array<{
        id: string;
        type: string;
        label: string;
        required?: boolean;
        options?: string[];
      }>;
      answers?: Record<string, unknown>;
    }>
  >([]);
  const [formAnswers, setFormAnswers] = useState<Record<string, Record<string, unknown>>>({});
  const [formSubmittingId, setFormSubmittingId] = useState<string | null>(null);

  async function loadPortalOs() {
    if (!token) return;
    try {
      const res = (await apiClient.get(`/proposals/portal/${token}/os`)) as any;
      const data = res?.data ?? res;
      setPortalTasks(data?.tasks || []);
      setPortalMessages(data?.messages || []);
    } catch {
      /* optional OS endpoints */
    }
  }

  async function loadAssignedForms() {
    if (!token) return;
    try {
      const res = (await apiClient.get(`/proposals/portal/${token}/forms/assigned`)) as any;
      const data = res?.data ?? res;
      const forms = data?.forms || [];
      setAssignedForms(forms);
      const initial: Record<string, Record<string, unknown>> = {};
      for (const f of forms) {
        initial[f.id] = { ...(f.answers || {}) };
      }
      setFormAnswers(initial);
    } catch {
      /* optional */
    }
  }

  useEffect(() => {
    if (!token) {
      setError('Invalid portal link');
      setIsLoading(false);
      return;
    }

    const loadPortal = async (attempt = 0): Promise<void> => {
      try {
        const response = (await apiClient.get(`/proposals/portal/${token}`)) as any;
        if (response.success) {
          setPortalData(response.data);
        } else {
          setError('Failed to load portal');
        }
        setIsLoading(false);
      } catch (err: any) {
        if (attempt === 0 && (err?.code === 'NETWORK_ERROR' || err?.code === 'TIMEOUT')) {
          await new Promise((r) => setTimeout(r, 2500));
          return loadPortal(1);
        }

        if (err?.code === 'PORTAL_NOT_FOUND') {
          setError(
            'This portal link is invalid or has expired. Please ask your accountant to send a new portal link.'
          );
        } else {
          setError(err?.message || 'Portal link not found or expired');
        }
        setIsLoading(false);
      }
    };

    loadPortal();
    void loadPortalOs();
    void loadAssignedForms();

    (async () => {
      if (!token) return;
      try {
        const res = (await apiClient.get(`/proposals/portal/${token}/forms`)) as any;
        const data = res?.data ?? res;
        const sub = data?.submission;
        if (sub) {
          setFormSubmittedAt(sub.submittedAt || null);
          setFormState({
            bankStatementsReady: !!sub.bankStatementsReady,
            bookkeepingSoftware: sub.bookkeepingSoftware || '',
            vatScheme: sub.vatScheme || '',
            payroll: !!sub.payroll,
            notes: sub.notes || '',
            contactPhone: sub.contactPhone || '',
          });
        }
      } catch {
        /* optional form endpoint */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- portal token drives load
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md w-full text-center">
          <ExclamationCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Portal Not Available
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            {error || 'This portal link is invalid or has expired.'}
          </p>
        </div>
      </div>
    );
  }

  const { client, practice, proposals } = portalData;
  const jobs = portalData.jobs || [];
  const files = portalData.files || [];
  const documentRequests = portalData.documentRequests || [];

  const actionableCount = proposals.filter(
    (p) => p.status === 'SENT' || p.status === 'VIEWED'
  ).length;

  /** Portal OS: top 3 things the client should finish */
  const openPortalTasks = portalTasks.filter((t) => !t.done);
  const openAssignedForms = assignedForms.filter((f) => f.status !== 'submitted');
  const actionableProposals = proposals.filter((p) => p.status === 'SENT' || p.status === 'VIEWED');
  const threeThings: Array<{ kind: string; title: string; detail: string }> = [];
  for (const f of openAssignedForms.slice(0, 2)) {
    threeThings.push({
      kind: 'Form',
      title: f.templateName,
      detail: f.description || 'Complete this questionnaire for your accountant',
    });
  }
  for (const t of openPortalTasks.slice(0, 2)) {
    if (threeThings.length >= 3) break;
    threeThings.push({
      kind: 'Task',
      title: t.title,
      detail: t.dueAt ? `Due ${formatDate(t.dueAt)}` : 'Tick off when done',
    });
  }
  for (const p of actionableProposals.slice(0, 2)) {
    if (threeThings.length >= 3) break;
    threeThings.push({
      kind: 'Proposal',
      title: p.title || p.reference,
      detail: 'Review and sign',
    });
  }

  async function submitRecordsForm() {
    if (!token) return;
    setFormBusy(true);
    setFormMsg(null);
    try {
      const res = (await apiClient.post(
        `/proposals/portal/${token}/forms/records-pack`,
        formState
      )) as any;
      const sub = res?.data?.submission ?? res?.submission;
      setFormSubmittedAt(sub?.submittedAt || new Date().toISOString());
      setFormMsg('Thank you — your records pack answers were sent to the practice.');
    } catch (e: any) {
      setFormMsg(e?.message || 'Could not submit form');
    } finally {
      setFormBusy(false);
    }
  }

  async function uploadPortalFile(file: File | null, requestItemId?: string) {
    if (!file || !token) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await apiClient.post(`/proposals/portal/${token}/files`, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: dataUrl,
        jobId: jobs[0]?.id || null,
        requestItemId: requestItemId || null,
      });
      // refresh portal
      const response = (await apiClient.get(`/proposals/portal/${token}`)) as any;
      if (response.success) setPortalData(response.data);
      setUploadMsg('File uploaded — thank you.');
    } catch (e: any) {
      setUploadMsg(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8] dark:bg-slate-900">
      {/* Header — soft metal chrome */}
      <header className="metal-tile metal-tile--soft sticky top-0 z-10 rounded-none border-x-0 border-t-0">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {practice.logo ? (
                <img src={practice.logo} alt={practice.name} className="h-10 w-auto" />
              ) : (
                <div className="metal-icon-well">
                  <BuildingOfficeIcon className="h-5 w-5 text-emerald-600" />
                </div>
              )}
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {practice.name}
                </h1>
                <p className="metal-kicker mt-0.5">Secure client portal</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900 dark:text-white">{client.name}</p>
              {client.contactName && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{client.contactName}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* 3 things for you — clearance portal home */}
        {threeThings.length > 0 && (
          <section className="mb-8 overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm dark:border-emerald-900 dark:from-emerald-950/40 dark:to-slate-900">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
              For you today
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
              {threeThings.length} thing{threeThings.length === 1 ? '' : 's'} to finish
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {practice.name} is waiting on these — complete them here securely.
            </p>
            <ol className="mt-4 space-y-2">
              {threeThings.map((item, i) => (
                <li
                  key={`${item.kind}-${item.title}-${i}`}
                  className="flex items-start gap-3 rounded-lg bg-white/80 px-3 py-2.5 ring-1 ring-emerald-100 dark:bg-slate-900/50 dark:ring-emerald-900"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-emerald-700">
                      {item.kind}
                    </span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </span>
                    <span className="block text-xs text-slate-500">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Soft metal KPI strip */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="metal-tile metal-tile--soft p-4 text-center">
            <span className="metal-specular" aria-hidden />
            <p className="relative z-[1] text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {proposals.length}
            </p>
            <p className="relative z-[1] metal-kicker mt-1">Proposals</p>
          </div>
          <div className="metal-tile metal-tile--soft metal-tile--sky p-4 text-center">
            <span className="metal-specular" aria-hidden />
            <p className="relative z-[1] text-2xl font-bold tabular-nums text-sky-800 dark:text-sky-200">
              {actionableCount}
            </p>
            <p className="relative z-[1] metal-kicker mt-1">Awaiting action</p>
          </div>
          <div className="metal-tile metal-tile--soft metal-tile--mint p-4 text-center">
            <span className="metal-specular" aria-hidden />
            <p className="relative z-[1] text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">
              {proposals.filter((p) => p.status === 'ACCEPTED').length}
            </p>
            <p className="relative z-[1] metal-kicker mt-1">Accepted</p>
          </div>
          <div className="metal-tile metal-tile--soft metal-tile--violet p-4 text-center">
            <span className="metal-specular" aria-hidden />
            <p className="relative z-[1] text-2xl font-bold tabular-nums text-violet-800 dark:text-violet-200">
              {jobs.length}
            </p>
            <p className="relative z-[1] metal-kicker mt-1">Active work</p>
          </div>
          <div className="metal-tile metal-tile--soft metal-tile--amber p-4 text-center col-span-2 sm:col-span-1">
            <span className="metal-specular" aria-hidden />
            <p className="relative z-[1] text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-200">
              {portalTasks.filter((t) => !t.done).length}
            </p>
            <p className="relative z-[1] metal-kicker mt-1">Open tasks</p>
          </div>
        </div>

        {/* Portal OS — tasks + messages */}
        <div className="mb-10 grid gap-4 lg:grid-cols-2">
          <div className="metal-tile metal-tile--soft p-5">
            <span className="metal-specular" aria-hidden />
            <div className="relative z-[1]">
              <p className="metal-kicker">Your checklist</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                Tasks from {practice.name}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Tick items off as you complete them — your accountant sees progress live.
              </p>
              <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {portalTasks.length === 0 && (
                  <li className="text-sm text-slate-500">
                    No tasks yet. Your practice will add items here.
                  </li>
                )}
                {portalTasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start gap-2 rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-600 dark:bg-slate-900/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={t.done}
                      disabled={osBusy}
                      onChange={async () => {
                        if (!token) return;
                        setOsBusy(true);
                        try {
                          await apiClient.patch(`/proposals/portal/${token}/os/tasks/${t.id}`, {
                            done: !t.done,
                          });
                          await loadPortalOs();
                        } catch {
                          setOsMsg('Could not update task');
                        } finally {
                          setOsBusy(false);
                        }
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium ${
                          t.done
                            ? 'text-slate-400 line-through'
                            : 'text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        {t.title}
                      </p>
                      {t.dueAt && (
                        <p className="text-2xs text-slate-400">Due {formatDate(t.dueAt)}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <input
                  className="input-field flex-1 text-sm"
                  placeholder="Add a note-to-self task…"
                  value={taskDraft}
                  onChange={(e) => setTaskDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0 text-xs"
                  disabled={osBusy || !taskDraft.trim()}
                  onClick={async () => {
                    if (!token || !taskDraft.trim()) return;
                    setOsBusy(true);
                    setOsMsg(null);
                    try {
                      await apiClient.post(`/proposals/portal/${token}/os/tasks`, {
                        title: taskDraft.trim(),
                      });
                      setTaskDraft('');
                      await loadPortalOs();
                    } catch {
                      setOsMsg('Could not add task');
                    } finally {
                      setOsBusy(false);
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="metal-tile metal-tile--soft metal-tile--mint p-5">
            <span className="metal-specular" aria-hidden />
            <div className="relative z-[1]">
              <p className="metal-kicker">Messages</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                Talk to {practice.name}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Secure thread — not email. Staff see this in the firm inbox and client Comms tab.
              </p>
              <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
                {portalMessages.length === 0 && (
                  <li className="text-sm text-slate-500">No messages yet. Say hello below.</li>
                )}
                {portalMessages.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      m.from === 'client'
                        ? 'ml-6 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
                        : 'mr-6 bg-white/80 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <p className="text-2xs font-semibold uppercase tracking-wide text-slate-400">
                      {m.from === 'client' ? 'You' : m.authorName || practice.name}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
                  </li>
                ))}
              </ul>
              <textarea
                className="input-field mt-3 min-h-[4rem] w-full text-sm"
                placeholder="Ask a question or confirm you have uploaded records…"
                value={msgDraft}
                onChange={(e) => setMsgDraft(e.target.value)}
              />
              <button
                type="button"
                className="btn-accent mt-2 text-sm"
                disabled={osBusy || !msgDraft.trim()}
                onClick={async () => {
                  if (!token || !msgDraft.trim()) return;
                  setOsBusy(true);
                  setOsMsg(null);
                  try {
                    await apiClient.post(`/proposals/portal/${token}/os/messages`, {
                      body: msgDraft.trim(),
                    });
                    setMsgDraft('');
                    await loadPortalOs();
                  } catch {
                    setOsMsg('Could not send message');
                  } finally {
                    setOsBusy(false);
                  }
                }}
              >
                Send message
              </button>
              {osMsg && <p className="mt-2 text-xs text-amber-700">{osMsg}</p>}
            </div>
          </div>
        </div>

        {/* Onboarding Journey teaser — ties the new automated touchpoint workflow into the client portal */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-tile mb-8 p-5 border border-primary-100 dark:border-primary-900/50"
        >
          <div className="flex items-center gap-3">
            <SparklesIcon className="h-5 w-5 text-primary-500" />
            <div>
              <span className="font-medium">Automated updates are enabled for your account.</span>
              <span className="ml-2 text-xs text-primary-600 dark:text-primary-400">
                Welcome • AML • Engagement • Reviews
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            You’ll receive timely emails at each stage of working with {practice.name}. No need to
            chase — we’ll guide you.
          </p>
        </motion.div>

        <div className="metal-tile metal-tile--soft metal-tile--mint mb-8 p-4 text-sm text-slate-600 dark:text-slate-300">
          <span className="metal-specular" aria-hidden />
          <p className="relative z-[1]">
            Secure client hub — proposals, delivery progress, and document exchange with{' '}
            <strong className="text-slate-800 dark:text-white">{practice.name}</strong>.
          </p>
        </div>

        {/* Assigned bulk forms from practice */}
        {assignedForms.length > 0 && (
          <div className="mb-10 space-y-4">
            <div>
              <p className="metal-kicker">Requested by your practice</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                Forms to complete
              </h2>
              <p className="text-sm text-slate-500">
                Secure questionnaires from {practice.name} — your answers go straight to the team.
              </p>
            </div>
            {assignedForms.map((af) => {
              const done = af.status === 'submitted';
              const answers = formAnswers[af.id] || {};
              return (
                <div key={af.id} className="metal-tile metal-tile--soft p-5">
                  <span className="metal-specular" aria-hidden />
                  <div className="relative z-[1]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        {af.templateName}
                      </h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          done ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {done ? 'Submitted' : 'Action needed'}
                      </span>
                    </div>
                    {af.description && (
                      <p className="mt-1 text-sm text-slate-500">{af.description}</p>
                    )}
                    {(af as any).dueAt && (
                      <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                        Due {formatDate((af as any).dueAt)}
                      </p>
                    )}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {af.fields.map((field) => {
                        const val = answers[field.id];
                        if (field.type === 'boolean') {
                          return (
                            <label
                              key={field.id}
                              className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"
                            >
                              <input
                                type="checkbox"
                                checked={!!val}
                                disabled={done || formSubmittingId === af.id}
                                onChange={(e) =>
                                  setFormAnswers((prev) => ({
                                    ...prev,
                                    [af.id]: { ...prev[af.id], [field.id]: e.target.checked },
                                  }))
                                }
                              />
                              {field.label}
                              {field.required ? ' *' : ''}
                            </label>
                          );
                        }
                        if (field.type === 'select') {
                          return (
                            <label key={field.id} className="text-xs text-slate-500">
                              {field.label}
                              {field.required ? ' *' : ''}
                              <select
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                                value={String(val ?? '')}
                                disabled={done || formSubmittingId === af.id}
                                onChange={(e) =>
                                  setFormAnswers((prev) => ({
                                    ...prev,
                                    [af.id]: { ...prev[af.id], [field.id]: e.target.value },
                                  }))
                                }
                              >
                                <option value="">Select…</option>
                                {(field.options || []).map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        }
                        if (field.type === 'textarea') {
                          return (
                            <label key={field.id} className="text-xs text-slate-500 sm:col-span-2">
                              {field.label}
                              {field.required ? ' *' : ''}
                              <textarea
                                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                                rows={2}
                                value={String(val ?? '')}
                                disabled={done || formSubmittingId === af.id}
                                onChange={(e) =>
                                  setFormAnswers((prev) => ({
                                    ...prev,
                                    [af.id]: { ...prev[af.id], [field.id]: e.target.value },
                                  }))
                                }
                              />
                            </label>
                          );
                        }
                        return (
                          <label key={field.id} className="text-xs text-slate-500">
                            {field.label}
                            {field.required ? ' *' : ''}
                            <input
                              type={
                                field.type === 'date'
                                  ? 'date'
                                  : field.type === 'number'
                                    ? 'number'
                                    : 'text'
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                              value={String(val ?? '')}
                              disabled={done || formSubmittingId === af.id}
                              onChange={(e) =>
                                setFormAnswers((prev) => ({
                                  ...prev,
                                  [af.id]: {
                                    ...prev[af.id],
                                    [field.id]:
                                      field.type === 'number'
                                        ? e.target.value === ''
                                          ? ''
                                          : Number(e.target.value)
                                        : e.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        );
                      })}
                    </div>
                    {!done && (
                      <button
                        type="button"
                        className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                        disabled={formSubmittingId === af.id}
                        onClick={async () => {
                          if (!token) return;
                          setFormSubmittingId(af.id);
                          try {
                            await apiClient.post(
                              `/proposals/portal/${token}/forms/${af.id}/submit`,
                              { answers: formAnswers[af.id] || {} }
                            );
                            await loadAssignedForms();
                          } catch {
                            /* toast via interceptor if any */
                          } finally {
                            setFormSubmittingId(null);
                          }
                        }}
                      >
                        {formSubmittingId === af.id ? 'Sending…' : 'Submit form'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Records pack questionnaire */}
        <div className="metal-tile metal-tile--soft mb-10 p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1]">
            <p className="metal-kicker">Records pack</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
              Help us prepare your work
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A short questionnaire so {practice.name} can request the right documents first time.
            </p>
            {formSubmittedAt && (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                Last submitted {new Date(formSubmittedAt).toLocaleString('en-GB')}
              </p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={formState.bankStatementsReady}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, bankStatementsReady: e.target.checked }))
                  }
                />
                Bank statements ready (12 months)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={formState.payroll}
                  onChange={(e) => setFormState((s) => ({ ...s, payroll: e.target.checked }))}
                />
                We run payroll
              </label>
              <label className="text-xs text-slate-500">
                Bookkeeping software
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={formState.bookkeepingSoftware}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, bookkeepingSoftware: e.target.value }))
                  }
                  placeholder="Xero, QuickBooks, Excel, none…"
                />
              </label>
              <label className="text-xs text-slate-500">
                VAT scheme
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={formState.vatScheme}
                  onChange={(e) => setFormState((s) => ({ ...s, vatScheme: e.target.value }))}
                  placeholder="Standard, flat rate, not registered…"
                />
              </label>
              <label className="text-xs text-slate-500">
                Best phone
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={formState.contactPhone}
                  onChange={(e) => setFormState((s) => ({ ...s, contactPhone: e.target.value }))}
                />
              </label>
              <label className="text-xs text-slate-500 sm:col-span-2">
                Anything else?
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  rows={2}
                  value={formState.notes}
                  onChange={(e) => setFormState((s) => ({ ...s, notes: e.target.value }))}
                />
              </label>
            </div>
            {formMsg && (
              <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-300">{formMsg}</p>
            )}
            <button
              type="button"
              className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              disabled={formBusy}
              onClick={() => void submitRecordsForm()}
            >
              {formBusy ? 'Sending…' : formSubmittedAt ? 'Update answers' : 'Submit records pack'}
            </button>
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="mb-10 space-y-4">
            <div className="flex items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your work</h2>
                <p className="text-xs text-slate-500">
                  Progress on work {practice.name} is delivering
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {jobs.map((j) => {
                const overdue = j.dueAt && new Date(j.dueAt).getTime() < Date.now();
                const pct = Math.min(100, j.progressPct || 0);
                return (
                  <div key={j.id} className="metal-tile metal-tile--soft p-4">
                    <span className="metal-specular" aria-hidden />
                    <div className="relative z-[1]">
                      <p className="font-semibold text-slate-900 dark:text-white">{j.title}</p>
                      <p className="text-xs text-slate-500">{j.reference}</p>
                      <div className="metal-progress-track mt-3 h-2 w-full overflow-hidden rounded-full">
                        <div
                          className="metal-progress-fill h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-200 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          {pct}% complete
                        </span>
                        {j.dueAt && (
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium ${
                              overdue
                                ? 'bg-red-50 text-red-700'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                            }`}
                          >
                            Due {formatDate(j.dueAt)}
                            {j.deadlineKind === 'STATUTORY' ? ' · HMRC' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {documentRequests.length > 0 && (
          <div className="space-y-4 mb-10">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Documents requested
              </h2>
              <p className="text-xs text-slate-500">
                {practice.name} has asked for the documents below — upload each one and the list
                ticks itself off.
              </p>
            </div>
            {documentRequests.map((dr) => {
              const received = dr.items.filter((i) => i.status === 'RECEIVED').length;
              return (
                <div
                  key={dr.id}
                  className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-slate-800 p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {dr.title}
                    </h3>
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {received}/{dr.items.length} uploaded
                    </span>
                  </div>
                  {dr.message && (
                    <p className="mt-1 text-xs text-slate-500 whitespace-pre-line">{dr.message}</p>
                  )}
                  <ul className="mt-3 space-y-2">
                    {dr.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-700 px-3 py-2"
                      >
                        {item.status === 'RECEIVED' ? (
                          <CheckCircleIcon className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <ClockIcon className="h-5 w-5 text-amber-500 flex-shrink-0" />
                        )}
                        <span
                          className={`flex-1 text-sm ${
                            item.status === 'RECEIVED'
                              ? 'text-slate-400 line-through'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {item.name}
                          {!item.required && (
                            <span className="text-xs text-slate-400"> (if available)</span>
                          )}
                        </span>
                        {item.status !== 'RECEIVED' && (
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-emerald-700">
                            {uploading ? 'Uploading…' : 'Upload'}
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploading}
                              onChange={(e) =>
                                void uploadPortalFile(e.target.files?.[0] || null, item.id)
                              }
                            />
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-4 mb-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Documents</h2>
              <p className="text-xs text-slate-500">Secure file exchange with your accountant</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
              {uploading ? 'Uploading…' : 'Upload file'}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void uploadPortalFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          {uploadMsg && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {uploadMsg}
            </p>
          )}
          {files.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800">
              No documents yet. Upload bank statements, IDs, or other records here securely.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <a
                    className="truncate font-medium text-emerald-600 hover:underline"
                    href={`/api/proposals/portal/${token}/files/${f.id}/download`}
                  >
                    {f.name}
                  </a>
                  <span className="shrink-0 text-xs text-slate-400">
                    {Math.round(f.sizeBytes / 1024)}kb ·{' '}
                    {f.uploadedBy === 'client' ? 'You' : 'Firm'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Your Proposals</h2>

          {proposals.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <DocumentTextIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                No proposals yet
              </h3>
              <p className="text-slate-500 dark:text-slate-400">
                You don&apos;t have any proposals to review at this time.
              </p>
            </div>
          ) : (
            proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                practiceName={practice.name}
                portalToken={token!}
              />
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-700 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Powered by <span className="font-medium text-primary-600">Engage by Capstone</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
