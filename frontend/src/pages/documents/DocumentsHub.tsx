import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderOpenIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import DocumentRequestDialog from '../../components/documents/DocumentRequestDialog';
import DocumentRequestList, {
  type DocumentRequestSummary,
} from '../../components/documents/DocumentRequestList';

type StatusFilter = 'OPEN' | 'COMPLETE' | 'CANCELLED' | 'ALL';

type RecentUpload = {
  id: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  uploadedBy: string;
  clientId: string;
  clientName: string;
};

type ClientRow = { id: string; name: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsHub() {
  const [requests, setRequests] = useState<DocumentRequestSummary[]>([]);
  const [uploads, setUploads] = useState<RecentUpload[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [loading, setLoading] = useState(true);
  const [dialogClient, setDialogClient] = useState<ClientRow | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
      const [reqRes, uploadsRes] = await Promise.all([
        apiClient.get(`/document-requests${qs}`) as Promise<{
          data?: { requests?: DocumentRequestSummary[] };
        }>,
        apiClient.get('/document-requests/recent-uploads') as Promise<{
          data?: { uploads?: RecentUpload[] };
        }>,
      ]);
      setRequests(reqRes?.data?.requests || []);
      setUploads(uploadsRes?.data?.uploads || []);
    } catch {
      setRequests([]);
      setUploads([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!clientPickerOpen || clients.length) return;
    void (async () => {
      try {
        const res = (await apiClient.get('/clients?limit=200')) as {
          data?: { clients?: ClientRow[] };
        };
        setClients(res?.data?.clients || []);
      } catch {
        setClients([]);
      }
    })();
  }, [clientPickerOpen, clients.length]);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10">
            <FolderOpenIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Documents</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Request, chase, and collect client documents through the secure portal.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setClientPickerOpen(true)}
          className="btn-primary flex items-center gap-2 cursor-pointer"
        >
          <PlusIcon className="h-5 w-5" /> Request documents
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {(['OPEN', 'COMPLETE', 'CANCELLED', 'ALL'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full cursor-pointer transition-colors ${
              statusFilter === s
                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30'
                : 'text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      ) : (
        <DocumentRequestList
          requests={requests}
          onChanged={() => void load()}
          showClient
          emptyText={
            statusFilter === 'OPEN'
              ? 'No open document requests — every client is up to date.'
              : 'Nothing here.'
          }
        />
      )}

      <div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Recent uploads
        </h2>
        {uploads.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Client uploads will appear here.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
            {uploads.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <ArrowDownTrayIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <a
                  href={`/api/jobs/files/${u.id}/download`}
                  className="font-medium text-slate-800 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-300 truncate"
                >
                  {u.name}
                </a>
                <Link
                  to={`/clients/${u.clientId}`}
                  className="text-xs text-slate-500 hover:underline truncate"
                >
                  {u.clientName}
                </Link>
                <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
                  {formatBytes(u.sizeBytes)} · {new Date(u.createdAt).toLocaleDateString('en-GB')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {clientPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Who are the documents for?
            </h3>
            <div className="relative mb-2">
              <MagnifyingGlassIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search clients…"
                className="input-field w-full pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {filteredClients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setDialogClient(c);
                    setClientPickerOpen(false);
                    setClientSearch('');
                  }}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-emerald-500/10 cursor-pointer"
                >
                  {c.name}
                </button>
              ))}
              {!filteredClients.length && (
                <p className="text-xs text-slate-500 px-3 py-2">No matching clients.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setClientPickerOpen(false);
                setClientSearch('');
              }}
              className="btn-secondary w-full mt-3 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <DocumentRequestDialog
        open={Boolean(dialogClient)}
        onClose={() => setDialogClient(null)}
        clientId={dialogClient?.id || ''}
        clientName={dialogClient?.name || ''}
        onCreated={() => void load()}
      />
    </div>
  );
}
