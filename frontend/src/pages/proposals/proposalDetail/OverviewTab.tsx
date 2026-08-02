/**
 * OverviewTab — client info, services list, cover letter (view/edit), full
 * terms & conditions, the electronic signature section, signed confirmation,
 * and notes. JSX verbatim from the ProposalDetail monolith; all state and
 * handlers come from useProposalDetail().
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PencilIcon,
  CheckIcon,
  PrinterIcon,
  DocumentTextIcon,
  BuildingOfficeIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { formatCurrency } from '../../../utils/formatters';
import { generateDefaultCoverLetter } from '../../../data/defaultCoverLetter';
import SignaturePad from '../../../components/SignaturePad';
import { useProposalDetail } from './ProposalDetailContext';
import { apiClient } from '../../../utils/api';
import {
  StatusChip,
  MoneyPill,
  boardColumnLabel,
  boardColumnTone,
} from '../../../components/ui/StatusChip';

/** Delivery job linked to an accepted proposal (spawn on accept). */
function DeliveryJobPanel({ proposalId }: { proposalId: string }) {
  const [job, setJob] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [spawning, setSpawning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Interceptor unwraps to { success, data: { jobs, columns } }
      const res = (await apiClient.get('/jobs', { params: { proposalId } })) as {
        data?: { jobs?: unknown[] };
        jobs?: unknown[];
      };
      const list = res?.data?.jobs ?? res?.jobs ?? [];
      setJob(Array.isArray(list) && list[0] ? list[0] : null);
    } catch (e: any) {
      setError(e?.message || 'Could not load job');
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function spawn() {
    setSpawning(true);
    setError(null);
    try {
      await apiClient.post(`/jobs/spawn-from-proposal/${proposalId}`, {});
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Spawn failed');
    } finally {
      setSpawning(false);
    }
  }

  if (loading) {
    return <div className="card h-16 animate-pulse bg-slate-100" />;
  }

  return (
    <div className="card border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/40">
            <BriefcaseIcon className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Delivery job
            </h3>
            {job ? (
              <>
                <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-300">
                  {job.title}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusChip tone={boardColumnTone(job.boardColumn)}>
                    {boardColumnLabel(job.boardColumn)}
                  </StatusChip>
                  <MoneyPill pence={job.proposedFeePence || 0} />
                  <span className="text-2xs text-slate-400">{job.reference}</span>
                </div>
              </>
            ) : (
              <p className="mt-0.5 text-sm text-slate-500">
                No job yet — spawn one to track phases, deadlines, and chases on the board.
              </p>
            )}
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {job ? (
            <Link to={`/jobs/${job.id}`} className="btn-accent text-xs">
              Open job
            </Link>
          ) : (
            <button
              type="button"
              className="btn-accent text-xs"
              disabled={spawning}
              onClick={() => void spawn()}
            >
              {spawning ? 'Creating…' : 'Create delivery job'}
            </button>
          )}
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={async () => {
              try {
                const h = (await apiClient.post('/integrations/accountflow/handoff', {
                  proposalId,
                  jobId: job?.id,
                  mode: 'create_and_open',
                })) as any;
                const d = h?.data ?? h;
                if (d?.deepLink) window.location.assign(d.deepLink);
              } catch {
                /* ignore */
              }
            }}
            title="Mock AccountFlow mesh — production AF untouched"
          >
            AccountFlow mesh
          </button>
          <Link to="/jobs" className="btn-secondary text-xs">
            Jobs board
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OverviewTab() {
  const {
    id,
    tenant,
    proposal,
    activeTab,
    setActiveTab,
    hasMixedVatRates,
    canEditCoverLetter,
    coverLetterDraft,
    setCoverLetterDraft,
    editingCoverLetter,
    setEditingCoverLetter,
    savingCoverLetter,
    handleSaveCoverLetter,
    handleInsertDefaultCoverLetter,
    generateFullTerms,
    handlePrint,
    showSignaturePad,
    setShowSignaturePad,
    setSignatureData,
    signatoryName,
    setSignatoryName,
    signatoryPosition,
    setSignatoryPosition,
    handleSignature,
    signedAt,
  } = useProposalDetail();

  return (
    <>
      {/* Client info */}
      <div className="glass-tile p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Client</h2>
        <div className="flex items-center">
          <div className="p-3 bg-white/50 dark:bg-slate-800/70 rounded-lg border border-white/10 dark:border-slate-600/40">
            <BuildingOfficeIcon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
          </div>
          <div className="ml-4">
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {proposal.client?.name}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {proposal.client?.contactEmail}
            </p>
            {proposal.client?.companyType && (
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                {proposal.client.companyType.replace(/_/g, ' ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Services — flat list, user decides frequency per service */}
      <div className="glass-tile p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Services</h2>

        <div className="space-y-3">
          {proposal.services?.map((service: any) => {
            const serviceFreq = service.billingFrequency || service.frequency || 'MONTHLY';
            return (
              <div
                key={service.id}
                className="flex items-start justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800/70 rounded-lg border border-slate-200 dark:border-slate-600/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{service.name}</p>
                    {service.vatRate !== 20 && hasMixedVatRates && (
                      <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 rounded">
                        VAT {service.vatRate}%
                      </span>
                    )}
                  </div>
                  {service.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                      {service.description}
                    </p>
                  )}
                  {service.discountPercent > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      {service.discountPercent}% off
                    </p>
                  )}
                  {serviceFreq === 'ONE_TIME' && service.oneOffDueDate && (
                    <p className="text-sm text-primary-600 dark:text-primary-400 mt-1">
                      Due: {format(new Date(service.oneOffDueDate), 'd MMMM yyyy')}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(service.lineTotal || service.total || 0)}
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      ex VAT
                    </span>
                  </p>
                  {(service.vatAmount > 0 || hasMixedVatRates) && (
                    <p className="text-xs text-slate-500 dark:text-slate-300 tabular-nums">
                      + {formatCurrency(service.vatAmount || 0)} VAT
                    </p>
                  )}
                  <p className="text-sm font-medium text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(
                      service.grossTotal ?? (service.total || 0) + (service.vatAmount || 0)
                    )}
                    <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                      inc VAT
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cover Letter */}
      {(proposal.coverLetter || canEditCoverLetter) && (
        <div className="glass-tile p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Cover letter
            </h2>
            {canEditCoverLetter && !editingCoverLetter && (
              <button
                type="button"
                onClick={() => {
                  setCoverLetterDraft(proposal.coverLetter || '');
                  setEditingCoverLetter(true);
                }}
                className="btn-secondary text-sm print:hidden"
              >
                <PencilIcon className="h-4 w-4 mr-1.5 inline" />
                Edit
              </button>
            )}
          </div>
          {editingCoverLetter ? (
            <div className="space-y-3">
              <textarea
                value={coverLetterDraft}
                onChange={(e) => setCoverLetterDraft(e.target.value)}
                className="input-field w-full min-h-[220px] text-sm font-sans text-slate-900 dark:text-slate-100"
                placeholder="Write your cover letter to the client…"
                aria-label="Cover letter"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSaveCoverLetter}
                  disabled={savingCoverLetter}
                  className="btn-primary text-sm"
                >
                  {savingCoverLetter ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCoverLetter(false);
                    setCoverLetterDraft(proposal.coverLetter || '');
                  }}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleInsertDefaultCoverLetter}
                  className="btn-secondary text-sm"
                >
                  Use template
                </button>
              </div>
            </div>
          ) : proposal.coverLetter ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {proposal.coverLetter}
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {generateDefaultCoverLetter({
                addresseeName: (
                  proposal.client?.contactName?.trim() ||
                  proposal.client?.name ||
                  'Client'
                ).trim(),
                practiceName: tenant?.name || 'Our practice',
                clientBusinessName: proposal.client?.name || undefined,
              })}
            </div>
          )}
        </div>
      )}

      {/* Full Terms & Conditions */}
      <div className="glass-tile p-6 print:break-before-page">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Terms & Conditions
          </h2>
          <button onClick={() => void handlePrint()} className="btn-secondary text-sm print:hidden">
            <PrinterIcon className="h-4 w-4 mr-2" />
            Print proposal PDF
          </button>
        </div>
        <div className="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 whitespace-pre-wrap text-sm max-h-96 overflow-y-auto print:max-h-none print:overflow-visible bg-white/40 dark:bg-slate-900/50 border border-white/20 dark:border-slate-600/50 p-4 rounded">
          {generateFullTerms()}
        </div>
      </div>

      {/* Signature Section */}
      {(proposal.status === 'SENT' || proposal.status === 'VIEWED') && (
        <div id="electronic-signature-section" className="glass-tile p-6 print:hidden">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Electronic Signature
          </h2>

          {!showSignaturePad ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                By signing below, you confirm acceptance of the Terms & Conditions and the services
                outlined in this proposal.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                    Signatory Name
                  </label>
                  <input
                    type="text"
                    value={signatoryName}
                    onChange={(e) => setSignatoryName(e.target.value)}
                    className="mt-1 input-field w-full"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                    Position
                  </label>
                  <input
                    type="text"
                    value={signatoryPosition}
                    onChange={(e) => setSignatoryPosition(e.target.value)}
                    className="mt-1 input-field w-full"
                    placeholder="e.g., Director"
                  />
                </div>
              </div>

              <button
                onClick={() => setShowSignaturePad(true)}
                disabled={!signatoryName || !signatoryPosition}
                className="btn-primary w-full"
              >
                <DocumentTextIcon className="h-4 w-4 mr-2 inline" />
                Sign Proposal Electronically
              </button>

              {(!signatoryName || !signatoryPosition) && (
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Please enter your name and position to enable signing
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <SignaturePad onSignature={handleSignature} onClear={() => setSignatureData(null)} />
              <button onClick={() => setShowSignaturePad(false)} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {proposal.status === 'ACCEPTED' && activeTab === 'overview' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-200">
                <CheckIcon className="h-5 w-5" />
                <span>
                  Signed by <strong>{proposal.acceptedBy}</strong>
                  {signedAt && <> on {format(signedAt, 'dd MMM yyyy, HH:mm')}</>}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('audit')}
                className="btn-secondary text-xs"
              >
                View signature &amp; access history
              </button>
            </div>
          </div>
          <DeliveryJobPanel proposalId={id || proposal.id} />
        </div>
      )}

      {proposal.notes && (
        <div className="glass-tile p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Notes</h2>
          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{proposal.notes}</p>
        </div>
      )}
    </>
  );
}
