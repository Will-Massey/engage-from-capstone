import { useCallback, useEffect, useState } from 'react';
import {
  DocumentTextIcon,
  PlusIcon,
  ClipboardDocumentIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { StatusChip } from '../../components/ui/StatusChip';

type LetterType = 'DISENGAGEMENT' | 'PROFESSIONAL_CLEARANCE' | 'HMRC_64_8';

interface Letter {
  id: string;
  type: LetterType;
  status: string;
  title: string;
  bodyHtml: string;
  createdAt: string;
  client: { id: string; name: string };
}

const TYPE_LABEL: Record<LetterType, string> = {
  DISENGAGEMENT: 'Disengagement',
  PROFESSIONAL_CLEARANCE: 'Professional clearance',
  HMRC_64_8: 'HMRC 64-8 pack',
};

export default function PracticeLetters() {
  const [letters, setLetters] = useState<Letter[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Letter | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editHtml, setEditHtml] = useState('');
  const [designerMode, setDesignerMode] = useState(false);
  const [blocks, setBlocks] = useState<
    Array<{
      type: 'header' | 'body' | 'services' | 'fees' | 'clauses' | 'signoff';
      content: string;
    }>
  >([
    { type: 'header', content: '' },
    { type: 'body', content: '' },
    { type: 'clauses', content: '' },
    { type: 'signoff', content: 'Yours faithfully,\n' },
  ]);
  const [form, setForm] = useState({
    type: 'DISENGAGEMENT' as LetterType,
    clientId: '',
    reason: '',
    successorFirm: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, cRes] = await Promise.all([
        apiClient.get('/practice-letters'),
        apiClient.get('/clients', { params: { limit: 100 } }),
      ]);
      setLetters(lRes.data?.data ?? lRes.data ?? []);
      const cl = cRes.data?.data ?? cRes.data ?? [];
      setClients(Array.isArray(cl) ? cl.map((c: any) => ({ id: c.id, name: c.name })) : []);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createLetter() {
    if (!form.clientId) {
      setError('Select a client');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await apiClient.post('/practice-letters', {
        type: form.type,
        clientId: form.clientId,
        reason: form.reason || undefined,
        successorFirm: form.successorFirm || undefined,
      });
      const letter = res.data?.data ?? res.data;
      setSelected(letter);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function markSent(id: string) {
    await apiClient.patch(`/practice-letters/${id}/status`, { status: 'SENT' });
    await load();
    if (selected?.id === id) {
      setSelected({ ...selected, status: 'SENT' });
    }
  }

  function startEdit(letter: Letter) {
    setEditing(true);
    setDesignerMode(false);
    setEditHtml(letter.bodyHtml || '');
  }

  function startDesigner(letter: Letter) {
    setEditing(true);
    setDesignerMode(true);
    // Seed blocks from plain text of letter
    const tmp = document.createElement('div');
    tmp.innerHTML = letter.bodyHtml || '';
    const text = tmp.textContent || '';
    setBlocks([
      { type: 'header', content: letter.title || '' },
      { type: 'body', content: text.slice(0, 1500) },
      { type: 'clauses', content: form.reason || '' },
      { type: 'signoff', content: 'Yours faithfully,' },
    ]);
  }

  async function saveLetter() {
    if (!selected) return;
    setCreating(true);
    setError(null);
    try {
      const res = designerMode
        ? await apiClient.patch(`/practice-letters/${selected.id}`, { blocks })
        : await apiClient.patch(`/practice-letters/${selected.id}`, { bodyHtml: editHtml });
      const letter = res.data?.data ?? res.data;
      setSelected(letter);
      setEditing(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || 'Save failed');
    } finally {
      setCreating(false);
    }
  }

  async function copyBody(letter: Letter) {
    const tmp = document.createElement('div');
    tmp.innerHTML = letter.bodyHtml || '';
    const text = tmp.textContent || tmp.innerText || '';
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
    } catch {
      setError('Could not copy to clipboard');
    }
  }

  function printLetter(letter: Letter) {
    const w = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${letter.title}</title>
      <style>
        body { font-family: Georgia, serif; max-width: 40rem; margin: 2rem auto; color: #0f172a; line-height: 1.55; }
        h1,h2,h3 { font-family: system-ui, sans-serif; }
      </style></head><body>
      <h1 style="font-size:1.25rem">${letter.title}</h1>
      <p style="color:#64748b;font-size:0.875rem">${TYPE_LABEL[letter.type] || letter.type} · ${letter.client?.name || ''}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.25rem 0"/>
      ${letter.bodyHtml}
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  const draftCount = letters.filter((l) => l.status === 'DRAFT').length;
  const sentCount = letters.filter((l) => l.status === 'SENT').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            <DocumentTextIcon className="h-6 w-6 text-emerald-500" />
            Practice letters
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Disengagement, professional clearance, and HMRC 64-8 packs
          </p>
        </div>
        {letters.length > 0 && (
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {draftCount} draft
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {sentCount} sent
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">New letter</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-slate-500">
            Type
            <select
              className="input-field mt-1"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as LetterType }))}
            >
              {(Object.keys(TYPE_LABEL) as LetterType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Client
            <select
              className="input-field mt-1"
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            >
              <option value="">Select…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {form.type === 'PROFESSIONAL_CLEARANCE' && (
            <label className="text-xs text-slate-500">
              Successor firm
              <input
                className="input-field mt-1"
                value={form.successorFirm}
                onChange={(e) => setForm((f) => ({ ...f, successorFirm: e.target.value }))}
              />
            </label>
          )}
          <label className="text-xs text-slate-500 sm:col-span-2">
            Reason / notes
            <input
              className="input-field mt-1"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Optional"
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-accent inline-flex items-center gap-1"
          disabled={creating}
          onClick={() => void createLetter()}
        >
          <PlusIcon className="h-4 w-4" />
          {creating ? 'Creating…' : 'Generate draft'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-2 text-sm font-semibold dark:border-slate-700">
            Recent letters
          </div>
          {loading ? (
            <div className="h-32 animate-pulse bg-slate-50" />
          ) : letters.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No letters yet</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700 max-h-96 overflow-y-auto">
              {letters.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                    onClick={() => setSelected(l)}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-50">
                        {l.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {TYPE_LABEL[l.type] || l.type} · {l.client?.name}
                      </p>
                    </div>
                    <StatusChip tone={l.status === 'SENT' ? 'success' : 'neutral'}>
                      {l.status}
                    </StatusChip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-4">
          {selected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-50">
                    {selected.title}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {TYPE_LABEL[selected.type] || selected.type} · {selected.client?.name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className="btn-secondary text-xs inline-flex items-center gap-1"
                    onClick={() => void copyBody(selected)}
                  >
                    <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                    Copy text
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs inline-flex items-center gap-1"
                    onClick={() => printLetter(selected)}
                  >
                    <PrinterIcon className="h-3.5 w-3.5" />
                    Print
                  </button>
                  {selected.status === 'DRAFT' && !editing && (
                    <>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => startEdit(selected)}
                      >
                        Edit HTML
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => startDesigner(selected)}
                      >
                        Block designer
                      </button>
                      <button
                        type="button"
                        className="btn-accent text-xs"
                        onClick={() => void markSent(selected.id)}
                      >
                        Mark sent
                      </button>
                    </>
                  )}
                  {editing && (
                    <>
                      <button
                        type="button"
                        className="btn-accent text-xs"
                        disabled={creating}
                        onClick={() => void saveLetter()}
                      >
                        {creating ? 'Saving…' : 'Save draft'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
              {editing && designerMode ? (
                <div className="space-y-3 rounded-lg border border-emerald-200/60 bg-emerald-50/30 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                    Document designer v1 — blocks
                  </p>
                  {blocks.map((b, i) => (
                    <label key={i} className="block text-xs text-slate-500">
                      {b.type}
                      <textarea
                        className="input-field mt-1 min-h-[4rem] text-sm"
                        value={b.content}
                        onChange={(e) => {
                          const next = [...blocks];
                          next[i] = { ...b, content: e.target.value };
                          setBlocks(next);
                        }}
                      />
                    </label>
                  ))}
                  <div className="flex flex-wrap gap-1">
                    {(['header', 'body', 'services', 'fees', 'clauses', 'signoff'] as const).map(
                      (t) => (
                        <button
                          key={t}
                          type="button"
                          className="rounded-full border border-slate-200 px-2 py-0.5 text-2xs font-medium hover:border-emerald-400"
                          onClick={() => setBlocks((bs) => [...bs, { type: t, content: '' }])}
                        >
                          + {t}
                        </button>
                      )
                    )}
                  </div>
                </div>
              ) : editing ? (
                <textarea
                  className="input-field min-h-[20rem] font-mono text-xs"
                  value={editHtml}
                  onChange={(e) => setEditHtml(e.target.value)}
                />
              ) : (
                <div
                  className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: selected.bodyHtml }}
                />
              )}
            </div>
          ) : (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
              <DocumentTextIcon className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-500">Select a letter to preview, copy, or print</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
