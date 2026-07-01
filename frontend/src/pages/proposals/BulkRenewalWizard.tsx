import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { format, addDays } from 'date-fns';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';

interface RenewalCandidate {
  clientId: string;
  clientName: string;
  companyType: string | null;
  proposalId: string;
  proposalReference: string;
  proposalTitle: string;
  renewalDate: string;
  total: number;
  paymentFrequency: string;
  hasPendingRenewal: boolean;
  daysUntilRenewal: number;
}

interface ProposalTemplateSummary {
  id: string;
  name: string;
  description?: string;
  serviceCount?: number;
}

const STEPS = [
  { id: 1, label: 'Filter clients' },
  { id: 2, label: 'Template & uplift' },
  { id: 3, label: 'Review' },
  { id: 4, label: 'Create drafts' },
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount);
}

function projectedTotal(total: number, upliftPercent: number) {
  return Math.round(total * (1 + upliftPercent / 100) * 100) / 100;
}

export default function BulkRenewalWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [expiringBefore, setExpiringBefore] = useState(
    format(addDays(new Date(), 30), 'yyyy-MM-dd')
  );
  const [candidates, setCandidates] = useState<RenewalCandidate[]>([]);
  const [selectedProposalIds, setSelectedProposalIds] = useState<Set<string>>(new Set());

  const [templates, setTemplates] = useState<ProposalTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [upliftPercent, setUpliftPercent] = useState(0);
  const [useAiCoverLetter, setUseAiCoverLetter] = useState(false);

  const [result, setResult] = useState<{
    created: Array<{
      clientId: string;
      clientName: string;
      proposalId?: string;
      reference?: string;
      title?: string;
      total?: number;
    }>;
    skipped: Array<{ clientId: string; clientName: string; reason?: string }>;
    failed: Array<{ clientId: string; clientName: string; reason?: string }>;
    summary: { requested: number; created: number; skipped: number; failed: number };
  } | null>(null);

  useEffect(() => {
    void loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const res = (await apiClient.getProposalTemplates()) as any;
      if (res.success) setTemplates(res.data || []);
    } catch {
      // templates are optional
    }
  };

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const res = (await apiClient.getRenewalCandidates({ expiringBefore })) as any;
      if (res.success) {
        const list: RenewalCandidate[] = res.data || [];
        setCandidates(list);
        const eligible = list.filter((c) => !c.hasPendingRenewal);
        setSelectedProposalIds(new Set(eligible.map((c) => c.proposalId)));
        if (list.length === 0) {
          toast('No contracts due for renewal before this date');
        }
      }
    } catch {
      toast.error('Could not load renewal candidates');
    } finally {
      setLoading(false);
    }
  };

  const selectedCandidates = useMemo(
    () => candidates.filter((c) => selectedProposalIds.has(c.proposalId)),
    [candidates, selectedProposalIds]
  );

  const eligibleSelected = useMemo(
    () => selectedCandidates.filter((c) => !c.hasPendingRenewal),
    [selectedCandidates]
  );

  const toggleProposal = (proposalId: string) => {
    setSelectedProposalIds((prev) => {
      const next = new Set(prev);
      if (next.has(proposalId)) next.delete(proposalId);
      else next.add(proposalId);
      return next;
    });
  };

  const toggleAllEligible = () => {
    const eligible = candidates.filter((c) => !c.hasPendingRenewal);
    const allSelected = eligible.every((c) => selectedProposalIds.has(c.proposalId));
    if (allSelected) {
      setSelectedProposalIds(new Set());
    } else {
      setSelectedProposalIds(new Set(eligible.map((c) => c.proposalId)));
    }
  };

  const handleCreateDrafts = async () => {
    if (eligibleSelected.length === 0) {
      toast.error('Select at least one client without an existing renewal draft');
      return;
    }

    setCreating(true);
    try {
      const res = (await apiClient.bulkCreateRenewalDrafts({
        proposalIds: eligibleSelected.map((c) => c.proposalId),
        templateId: templateId || undefined,
        upliftPercent,
        useAiCoverLetter,
      })) as any;

      if (res.success) {
        setResult(res.data);
        setStep(4);
        const { created, skipped, failed } = res.data.summary;
        if (created > 0) {
          toast.success(
            `Created ${created} renewal draft${created === 1 ? '' : 's'} — review before sending`
          );
        }
        if (skipped > 0 || failed > 0) {
          toast(`${skipped} skipped, ${failed} failed`);
        }
      }
    } catch {
      toast.error('Bulk renewal failed');
    } finally {
      setCreating(false);
    }
  };

  const stepIndicator = (
    <ol className="flex flex-wrap gap-2 sm:gap-4 mb-6">
      {STEPS.map((s) => (
        <li
          key={s.id}
          className={`flex items-center gap-2 text-sm ${
            step === s.id
              ? 'text-primary-700 dark:text-primary-300 font-semibold'
              : step > s.id
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              step === s.id
                ? 'bg-primary-600 text-white'
                : step > s.id
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {step > s.id ? '✓' : s.id}
          </span>
          <span className="hidden sm:inline">{s.label}</span>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link to="/proposals" className="btn-secondary text-sm">
          <ArrowLeftIcon className="h-4 w-4 mr-1.5" />
          Back to proposals
        </Link>
      </div>

      <div className="card p-6">
        <div className="flex items-start gap-3 mb-2">
          <ArrowPathIcon className="h-8 w-8 text-emerald-600 shrink-0" />
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
              Bulk renewal wizard
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Filter clients with expiring contracts, apply a fee uplift or template, then create
              draft renewals for review — nothing is sent automatically.
            </p>
          </div>
        </div>

        {stepIndicator}

        {/* Step 1 — Filter */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="max-w-sm">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Contracts renewing on or before
              </label>
              <input
                type="date"
                value={expiringBefore}
                onChange={(e) => setExpiringBefore(e.target.value)}
                className="input-field w-full"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Defaults to 30 days ahead — adjust for your renewal pipeline.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadCandidates()}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Loading…' : 'Find clients'}
            </button>

            {candidates.length > 0 && (
              <div className="mt-4 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={
                        candidates.filter((c) => !c.hasPendingRenewal).length > 0 &&
                        candidates
                          .filter((c) => !c.hasPendingRenewal)
                          .every((c) => selectedProposalIds.has(c.proposalId))
                      }
                      onChange={toggleAllEligible}
                      className="rounded border-slate-300"
                    />
                    Select all eligible ({candidates.filter((c) => !c.hasPendingRenewal).length})
                  </label>
                  <span className="text-xs text-slate-500">
                    {selectedProposalIds.size} selected
                  </span>
                </div>
                <ul className="divide-y divide-slate-200 dark:divide-slate-700 max-h-80 overflow-y-auto">
                  {candidates.map((c) => (
                    <li
                      key={c.proposalId}
                      className={`px-4 py-3 flex items-start gap-3 ${
                        c.hasPendingRenewal ? 'opacity-60' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProposalIds.has(c.proposalId)}
                        disabled={c.hasPendingRenewal}
                        onChange={() => toggleProposal(c.proposalId)}
                        className="mt-1 rounded border-slate-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white">{c.clientName}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {c.proposalReference} — {c.proposalTitle}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Renews{' '}
                          {format(new Date(c.renewalDate), 'dd MMM yyyy')}
                          {c.daysUntilRenewal <= 0
                            ? ' (overdue)'
                            : ` (${c.daysUntilRenewal} days)`}
                          {' · '}
                          {formatCurrency(c.total)}
                        </p>
                        {c.hasPendingRenewal && (
                          <span className="inline-flex mt-1 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            Renewal draft already exists
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={selectedProposalIds.size === 0}
                onClick={() => setStep(2)}
                className="btn-primary disabled:opacity-50"
              >
                Continue
                <ArrowRightIcon className="h-4 w-4 ml-2" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Template & uplift */}
        {step === 2 && (
          <div className="space-y-6 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Proposal template (optional)
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="input-field w-full"
              >
                <option value="">Keep original cover letter & terms</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.serviceCount ? ` (${t.serviceCount} services)` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Applies template cover letter and terms; service lines are copied from the signed
                contract with any uplift below.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Fee uplift (%)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={-10}
                  max={20}
                  step={0.5}
                  value={upliftPercent}
                  onChange={(e) => setUpliftPercent(Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={-50}
                  max={50}
                  step={0.5}
                  value={upliftPercent}
                  onChange={(e) => setUpliftPercent(Number(e.target.value))}
                  className="input-field w-24 text-right"
                />
                <span className="text-sm text-slate-600">%</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {upliftPercent === 0
                  ? 'Fees unchanged from the prior year.'
                  : upliftPercent > 0
                    ? `Fees will increase by ${upliftPercent}% on each line.`
                    : `Fees will decrease by ${Math.abs(upliftPercent)}%.`}
              </p>
            </div>

            <label className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer hover:border-primary-400 transition-colors">
              <input
                type="checkbox"
                checked={useAiCoverLetter}
                onChange={(e) => setUseAiCoverLetter(e.target.checked)}
                className="mt-1 rounded border-slate-300"
              />
              <div>
                <span className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white text-sm">
                  <SparklesIcon className="h-4 w-4 text-purple-500" />
                  Draft cover letters with Clara (AI)
                </span>
                <p className="text-xs text-slate-500 mt-1">
                  Generates a tailored renewal cover letter per client. Slower for large batches but
                  saves manual editing later.
                </p>
              </div>
            </label>

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">
                Back
              </button>
              <button type="button" onClick={() => setStep(3)} className="btn-primary">
                Review selection
                <ArrowRightIcon className="h-4 w-4 ml-2" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 text-sm">
              <p>
                <strong>{eligibleSelected.length}</strong> renewal draft
                {eligibleSelected.length === 1 ? '' : 's'} will be created as{' '}
                <strong>DRAFT</strong> — review and send each one when ready.
              </p>
              {templateId && (
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  Template: {templates.find((t) => t.id === templateId)?.name}
                </p>
              )}
              {upliftPercent !== 0 && (
                <p className="mt-1 text-slate-600 dark:text-slate-400">
                  Fee uplift: {upliftPercent > 0 ? '+' : ''}
                  {upliftPercent}%
                </p>
              )}
              {useAiCoverLetter && (
                <p className="mt-1 text-purple-700 dark:text-purple-300">AI cover letters enabled</p>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/80">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Client</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-600">Renewal date</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-600">Current</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-600">Projected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {eligibleSelected.map((c) => (
                    <tr key={c.proposalId}>
                      <td className="px-4 py-2">
                        <p className="font-medium">{c.clientName}</p>
                        <p className="text-xs text-slate-500">{c.proposalReference}</p>
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {format(new Date(c.renewalDate), 'dd MMM yyyy')}
                      </td>
                      <td className="px-4 py-2 text-right">{formatCurrency(c.total)}</td>
                      <td className="px-4 py-2 text-right font-medium text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(projectedTotal(c.total, upliftPercent))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedCandidates.length > eligibleSelected.length && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {selectedCandidates.length - eligibleSelected.length} client(s) skipped — they
                already have a renewal draft in progress.
              </p>
            )}

            <div className="flex justify-between pt-2">
              <button type="button" onClick={() => setStep(2)} className="btn-secondary">
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleCreateDrafts()}
                disabled={creating || eligibleSelected.length === 0}
                className="btn-primary disabled:opacity-50"
              >
                {creating ? 'Creating drafts…' : `Create ${eligibleSelected.length} draft renewal${eligibleSelected.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Results */}
        {step === 4 && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <CheckCircleIcon className="h-8 w-8 text-emerald-600 shrink-0" />
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-100">
                  {result.summary.created} renewal draft{result.summary.created === 1 ? '' : 's'}{' '}
                  created
                </p>
                <p className="text-sm text-emerald-800 dark:text-emerald-200">
                  Open each draft to review pricing and cover letter, then send when you are ready.
                </p>
              </div>
            </div>

            {result.created.length > 0 && (
              <ul className="divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl">
                {result.created.map((item) => (
                  <li key={item.proposalId} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.clientName}</p>
                      <p className="text-xs text-slate-500">
                        {item.reference} — {formatCurrency(item.total ?? 0)}
                      </p>
                    </div>
                    <Link
                      to={`/proposals/${item.proposalId}/edit`}
                      className="text-sm text-primary-600 hover:underline"
                    >
                      Review draft
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {(result.skipped.length > 0 || result.failed.length > 0) && (
              <div className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                {result.skipped.map((s) => (
                  <p key={`skip-${s.clientId}`}>
                    Skipped {s.clientName}: {s.reason}
                  </p>
                ))}
                {result.failed.map((f) => (
                  <p key={`fail-${f.clientId}`} className="text-red-600">
                    Failed {f.clientName}: {f.reason}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/proposals?status=DRAFT')}
                className="btn-primary"
              >
                View all drafts
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setResult(null);
                  void loadCandidates();
                }}
                className="btn-secondary"
              >
                Run again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}