/**
 * AuditTab — access & signature compliance view: summary stats, signed-by
 * details, per-signature forensic audit, and the chronological access history
 * with CSV / clipboard export. JSX verbatim from the ProposalDetail monolith;
 * all state and handlers come from useProposalDetail().
 */

import {
  EnvelopeIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  EyeIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { copyTextToClipboard } from '../../../utils/clipboard';
import { useProposalDetail } from './ProposalDetailContext';

function downloadAuditTrailCsv(trail: any[], reference: string) {
  const headers = ['timestamp_utc', 'action', 'actor', 'ip_address', 'details_json'];
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = trail.map((e) =>
    [
      new Date(e.timestamp).toISOString(),
      e.action || '',
      e.actor || '',
      e.ipAddress || '',
      JSON.stringify(e.details || {}),
    ]
      .map(escape)
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `proposal-audit-${reference}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AuditTab() {
  const {
    proposal,
    auditTrail,
    loadingAudit,
    loadAuditTrail,
    clientOpenCount,
    firstViewedAt,
    lastViewedAt,
    signedAt,
    signatoryName,
    downloadSignatureCertificate,
    downloadSignatureAuditJson,
  } = useProposalDetail();

  return (
    <>
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-tile p-4 text-center">
          <p className="text-2xl font-bold text-purple-600 tabular-nums">{clientOpenCount}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Client opens</p>
        </div>
        <div className="glass-tile p-4 text-center">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {firstViewedAt ? format(firstViewedAt, 'dd MMM HH:mm') : '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">First opened</p>
        </div>
        <div className="glass-tile p-4 text-center">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {lastViewedAt ? formatDistanceToNow(lastViewedAt, { addSuffix: true }) : '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Last activity</p>
        </div>
        <div className="glass-tile p-4 text-center">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            {signedAt ? format(signedAt, 'dd MMM HH:mm') : '—'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Signed</p>
        </div>
      </div>

      {/* Display Signature if accepted */}
      {(proposal.status === 'ACCEPTED' || proposal.signature) && (
        <div className="glass-tile p-6 print:break-inside-avoid">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Signed by
          </h2>
          <div className="space-y-2">
            {proposal.signature && (
              <div className="border border-white/20 dark:border-slate-600/50 rounded p-2 bg-white/40 dark:bg-slate-900/50 inline-block">
                <img
                  src={proposal.signature}
                  alt="Electronic Signature"
                  className="h-16 object-contain"
                />
              </div>
            )}
            <p className="text-sm text-slate-800 dark:text-slate-200">
              <span className="font-medium">Name:</span> {proposal.acceptedBy || signatoryName}
            </p>
            {proposal.signatoryPosition && (
              <p className="text-sm text-slate-800 dark:text-slate-200">
                <span className="font-medium">Position:</span> {proposal.signatoryPosition}
              </p>
            )}
            {proposal.acceptedAt && (
              <p className="text-sm text-slate-800 dark:text-slate-200">
                <span className="font-medium">Date:</span>{' '}
                {format(new Date(proposal.acceptedAt), 'dd MMMM yyyy HH:mm')}
              </p>
            )}
          </div>
        </div>
      )}

      {proposal.signatures?.length > 0 && (
        <div className="glass-tile p-6 print:break-inside-avoid">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            Signature audit
          </h2>
          <div className="space-y-6">
            {proposal.signatures.map((sig: any) => (
              <div
                key={sig.id}
                className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 p-4 space-y-3"
              >
                <dl className="text-sm space-y-2 text-slate-800 dark:text-slate-200">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400">Type</dt>
                    <dd>{sig.signatureType || 'SIMPLE_ELECTRONIC'}</dd>
                  </div>
                  {sig.agreementVersion && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500 dark:text-slate-400">Agreement version</dt>
                      <dd className="font-mono text-xs">{sig.agreementVersion}</dd>
                    </div>
                  )}
                  {sig.signerEmail && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                      <dd className="text-right break-all">{sig.signerEmail}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500 dark:text-slate-400">Signed at (UTC)</dt>
                    <dd>{format(new Date(sig.signedAt), 'dd MMM yyyy HH:mm:ss')}</dd>
                  </div>
                  {sig.ipAddress && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500 dark:text-slate-400">IP address</dt>
                      <dd className="font-mono text-xs">{sig.ipAddress}</dd>
                    </div>
                  )}
                  {sig.geoLocation && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500 dark:text-slate-400">Location</dt>
                      <dd>{sig.geoLocation}</dd>
                    </div>
                  )}
                  {sig.userAgent && (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400 mb-1">User agent</dt>
                      <dd className="font-mono text-xs break-all bg-slate-100 dark:bg-slate-900/50 p-2 rounded">
                        {sig.userAgent}
                      </dd>
                    </div>
                  )}
                  {sig.deviceInfo && (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400 mb-1">Device info</dt>
                      <dd className="font-mono text-xs break-all bg-slate-100 dark:bg-slate-900/50 p-2 rounded">
                        {sig.deviceInfo}
                      </dd>
                    </div>
                  )}
                  {sig.documentHash && (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400 mb-1">Document hash</dt>
                      <dd className="font-mono text-xs break-all bg-slate-100 dark:bg-slate-900/50 p-2 rounded">
                        {sig.documentHash}
                      </dd>
                    </div>
                  )}
                  {sig.termsHash && (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400 mb-1">Terms hash</dt>
                      <dd className="font-mono text-xs break-all bg-slate-100 dark:bg-slate-900/50 p-2 rounded">
                        {sig.termsHash}
                      </dd>
                    </div>
                  )}
                  {sig.consentText && (
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400 mb-1">Consent</dt>
                      <dd className="text-xs italic">{sig.consentText}</dd>
                    </div>
                  )}
                </dl>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => downloadSignatureCertificate(sig.id)}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                    Download certificate PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSignatureAuditJson(sig.id)}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                    Download audit JSON
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dedicated Access & Signature History — prominent compliance view */}
      <div className="glass-tile p-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Access &amp; Signature History
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Chronological record of client access via the secure link and electronic signing
              events. Use for compliance and audit.
            </p>
          </div>
          <div className="flex items-center gap-1.5 print:hidden">
            <button
              onClick={loadAuditTrail}
              disabled={loadingAudit}
              className="btn-secondary text-xs flex items-center gap-1.5"
              title="Refresh audit trail"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => {
                if (auditTrail.length === 0) return;
                downloadAuditTrailCsv(auditTrail, proposal.reference);
                toast.success('Audit trail downloaded as CSV');
              }}
              disabled={auditTrail.length === 0}
              className="btn-secondary text-xs flex items-center gap-1.5"
              title="Download CSV for compliance records"
            >
              <ArrowDownTrayIcon className="h-3.5 w-3.5" />
              CSV
            </button>
            <button
              onClick={async () => {
                if (auditTrail.length === 0) return;
                const text = auditTrail
                  .map((e: any) => {
                    const t = new Date(e.timestamp).toISOString();
                    const d = e.details ? JSON.stringify(e.details) : '';
                    return `${t} | ${e.action} | ${e.actor || ''} | IP:${e.ipAddress || ''} ${d}`;
                  })
                  .join('\n');
                const ok = await copyTextToClipboard(text);
                if (ok) toast.success('Audit trail copied to clipboard');
              }}
              disabled={auditTrail.length === 0}
              className="btn-secondary text-xs"
              title="Copy audit trail for compliance records"
            >
              Copy
            </button>
          </div>
        </div>

        {auditTrail.length === 0 && !loadingAudit ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center">
            <EyeIcon className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              No client access recorded yet.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Send the proposal link. Views and signatures will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {auditTrail.map((entry: any, index: number) => {
              const ts = new Date(entry.timestamp);
              const action = (entry.action || '').toUpperCase();
              const isView = action.includes('VIEW');
              const isSigned = action.includes('ACCEPT') || action.includes('SIGN');
              const isSent = action.includes('SENT');

              let icon = <ClockIcon className="h-4 w-4 text-slate-400" />;
              let label = entry.action || 'Event';
              let highlight = '';

              if (isView) {
                icon = <EyeIcon className="h-4 w-4 text-purple-600" />;
                label = 'Client viewed the proposal';
                highlight = 'text-purple-700 dark:text-purple-300';
              } else if (isSigned) {
                icon = <PencilSquareIcon className="h-4 w-4 text-emerald-600" />;
                const who =
                  entry.details?.signedByRole || entry.actor || entry.details?.signedBy || 'Client';
                label = `Electronically signed by ${who}`;
                highlight = 'text-emerald-700 dark:text-emerald-300';
              } else if (isSent) {
                icon = <EnvelopeIcon className="h-4 w-4 text-blue-600" />;
                label = 'Proposal sent to client';
                highlight = 'text-blue-700 dark:text-blue-300';
              } else if (action.includes('WITHDRAW')) {
                icon = <NoSymbolIcon className="h-4 w-4 text-amber-600" />;
                label = 'Proposal rescinded by practice';
                highlight = 'text-amber-700 dark:text-amber-300';
              }

              return (
                <div
                  key={index}
                  className="flex gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 px-3 py-2.5"
                >
                  <div className="mt-0.5 shrink-0">{icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium ${highlight}`}>{label}</div>

                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                      <span title={ts.toISOString()}>
                        {formatDistanceToNow(ts, { addSuffix: true })}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span>{format(ts, 'dd MMM yyyy, HH:mm')}</span>

                      {entry.ipAddress && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span className="font-mono text-[10px]">{entry.ipAddress}</span>
                        </>
                      )}
                      {entry.details?.viewDuration != null && (
                        <>
                          <span className="text-slate-400">·</span>
                          <span>
                            {Math.round(entry.details.viewDuration / 1000 / 60)} min viewed
                          </span>
                        </>
                      )}
                    </div>

                    {/* Extra forensic / useful details */}
                    {isSigned && (
                      <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                        {entry.details?.signedByRole && (
                          <div>Role: {entry.details.signedByRole}</div>
                        )}
                        {entry.details?.agreementAccepted && <div>Terms accepted: Yes</div>}
                        {entry.details?.documentHash && (
                          <div className="font-mono text-[10px] break-all opacity-70">
                            Doc hash: {String(entry.details.documentHash).slice(0, 20)}…
                          </div>
                        )}
                      </div>
                    )}

                    {isView && entry.details?.completed && (
                      <div className="text-[10px] text-emerald-600 mt-0.5">
                        Marked complete by client
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-[10px] text-slate-400 leading-snug">
          This trail is generated from secure link access logs and signature records. It is intended
          for your compliance files.
        </p>
      </div>
    </>
  );
}
