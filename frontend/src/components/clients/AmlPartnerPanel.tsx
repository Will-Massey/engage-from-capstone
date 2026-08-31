import { useEffect, useState } from 'react';
import {
  ShieldCheckIcon,
  DocumentTextIcon,
  EyeIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import type { AmlDocumentMeta } from '../../types/aml';
import { AML_STATUS_COLOURS, AML_STATUS_LABELS } from '../../utils/amlBadge';
import ComingSoonCallout from '../ui/ComingSoonCallout';

const DOC_LABELS: Record<string, string> = {
  photo_id: 'Photo ID',
  proof_of_address: 'Proof of address',
};

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AmlPartnerPanelProps {
  clientId: string;
  clientName: string;
  amlSubmittedAt?: string | null;
  amlCompletedAt?: string | null;
  onUpdated?: () => void;
}

type AmlStatusData = {
  amlStatus: string;
  amlProviderRef: string | null;
  amlCheckedAt: string | null;
  lastCheckMessage: string | null;
  documents?: AmlDocumentMeta[];
};

export default function AmlPartnerPanel({
  clientId,
  clientName,
  amlSubmittedAt,
  amlCompletedAt,
  onUpdated,
}: AmlPartnerPanelProps) {
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [status, setStatus] = useState<AmlStatusData | null>(null);
  const [running, setRunning] = useState(false);
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [basis, setBasis] = useState('DOCUMENTS_VERIFIED');
  const [clearNote, setClearNote] = useState('');

  const loadStatus = async () => {
    try {
      const res = (await apiClient.getAmlStatus(clientId)) as any;
      if (res.success) {
        setStatus(res.data);
      }
    } catch {
      // Non-blocking — panel still usable for recording a manual clear
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadStatus is recreated each render; clientId is its only real input
  }, [clientId]);

  const markComplete = async () => {
    setRunning(true);
    try {
      await apiClient.amlManualClear({
        clientId,
        basis,
        note: clearNote.trim() || undefined,
      });
      toast.success('AML recorded as complete');
      setClearing(false);
      setClearNote('');
      await loadStatus();
      onUpdated?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e.message || 'Could not record AML');
    } finally {
      setRunning(false);
    }
  };

  const openDocument = async (doc: AmlDocumentMeta, download: boolean) => {
    setDocBusy(`${doc.type}:${download ? 'dl' : 'view'}`);
    try {
      const blob = await apiClient.getAmlDocument(clientId, doc.type);
      const url = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName || `${doc.type}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      toast.error(e?.message || 'Could not open the document');
    } finally {
      setDocBusy(null);
    }
  };

  const amlStatus = status?.amlStatus ?? 'NOT_STARTED';
  const documents = status?.documents ?? [];

  return (
    <div className="glass-tile p-5 space-y-3" data-testid="aml-partner-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <ShieldCheckIcon className="h-6 w-6 text-emerald-600 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              AML &amp; ID verification
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Record your own AML evidence for {clientName}. Partner checks are paused while we
              review Credas.
            </p>
          </div>
        </div>

        {!loadingStatus && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0 ${AML_STATUS_COLOURS[amlStatus] ?? AML_STATUS_COLOURS.NOT_STARTED}`}
            data-testid="aml-status-badge"
          >
            {AML_STATUS_LABELS[amlStatus] ?? amlStatus}
          </span>
        )}
      </div>

      <ComingSoonCallout title="Partner AML checks" testId="aml-coming-soon">
        SmartSearch and Creditsafe initiation is switched off while we weigh Credas. Keep using
        documents and <span className="font-medium">Mark AML as complete</span> for your own checks.
      </ComingSoonCallout>

      {status?.amlCheckedAt && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Last checked:{' '}
          {new Date(status.amlCheckedAt).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}

      {documents.length > 0 && (
        <div
          className="rounded-lg border border-slate-200/80 dark:border-slate-700/80 divide-y divide-slate-200/80 dark:divide-slate-700/80"
          data-testid="aml-documents"
        >
          {documents.map((doc) => (
            <div key={doc.type} className="flex items-center gap-3 px-3 py-2.5">
              <DocumentTextIcon className="h-5 w-5 text-slate-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {DOC_LABELS[doc.type] ?? doc.type}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {doc.fileName}
                  {formatBytes(doc.sizeBytes) ? ` · ${formatBytes(doc.sizeBytes)}` : ''}
                  {doc.uploadedAt
                    ? ` · ${new Date(doc.uploadedAt).toLocaleDateString('en-GB')}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => openDocument(doc, false)}
                  disabled={docBusy === `${doc.type}:view`}
                  className="btn-secondary text-xs inline-flex items-center gap-1.5"
                  title="View document"
                >
                  <EyeIcon className="h-4 w-4" />
                  View
                </button>
                <button
                  type="button"
                  onClick={() => openDocument(doc, true)}
                  disabled={docBusy === `${doc.type}:dl`}
                  className="btn-secondary text-xs inline-flex items-center gap-1.5"
                  title="Download document"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {amlCompletedAt ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          AML complete — {new Date(amlCompletedAt).toLocaleDateString('en-GB')}.
        </p>
      ) : amlSubmittedAt ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Client submitted ID details — review before marking complete.
        </p>
      ) : null}

      {status?.amlStatus !== 'CLEAR' && (
        <div className="mb-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          {!clearing ? (
            <button
              type="button"
              onClick={() => setClearing(true)}
              className="btn-primary text-sm"
              data-testid="aml-mark-complete"
            >
              Mark AML as complete
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Record AML as complete for {clientName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Use this when you have satisfied your own AML obligations. It is recorded against
                your name.
              </p>
              <select
                className="input w-full text-sm"
                value={basis}
                onChange={(e) => setBasis(e.target.value)}
              >
                <option value="DOCUMENTS_VERIFIED">I have verified the ID documents</option>
                <option value="EXTERNAL_CHECK">Checked with another provider</option>
                <option value="EXISTING_CLIENT">Existing client, already onboarded</option>
                <option value="OTHER">Other (describe below)</option>
              </select>
              <textarea
                className="input w-full text-sm"
                rows={2}
                placeholder={
                  basis === 'OTHER' ? 'Describe the basis (required)' : 'Note (optional)'
                }
                value={clearNote}
                onChange={(e) => setClearNote(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary text-sm"
                  disabled={running || (basis === 'OTHER' && !clearNote.trim())}
                  onClick={() => void markComplete()}
                >
                  {running ? 'Recording…' : 'Record as complete'}
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => setClearing(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
