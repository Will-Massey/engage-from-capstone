import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';

type ImportRow = {
  name: string;
  contactEmail: string;
  contactName?: string;
  contactPhone?: string;
  companyNumber?: string;
  companyType?: string;
  notes?: string;
};

const SAMPLE_CSV = `name,contactEmail,contactName,contactPhone,companyNumber,companyType,notes
Acme Trading Ltd,accounts@acme.example,Jane Smith,07700900000,12345678,LIMITED_COMPANY,Migrated from Engager
Sole Trader Joe,joe@example.com,Joe Bloggs,,,SOLE_TRADER,
`;

function parseCsv(text: string): ImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const split = (line: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === ',' && !inQ) {
        cells.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const headers = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ''));
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iName = idx(['name', 'client', 'clientname', 'company']);
  const iEmail = idx(['contactemail', 'email', 'clientemail']);
  const iContact = idx(['contactname', 'contact', 'primarycontact']);
  const iPhone = idx(['contactphone', 'phone', 'mobile', 'tel']);
  const iCo = idx(['companynumber', 'companyno', 'crn', 'registrationnumber']);
  const iType = idx(['companytype', 'type', 'entitytype']);
  const iNotes = idx(['notes', 'note', 'comments']);

  if (iName < 0 || iEmail < 0) {
    throw new Error('CSV must include name and contactEmail (or email) columns');
  }

  const rows: ImportRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = split(lines[r]);
    const name = cells[iName] || '';
    const contactEmail = cells[iEmail] || '';
    if (!name || !contactEmail) continue;
    rows.push({
      name,
      contactEmail,
      contactName: iContact >= 0 ? cells[iContact] : undefined,
      contactPhone: iPhone >= 0 ? cells[iPhone] : undefined,
      companyNumber: iCo >= 0 ? cells[iCo] : undefined,
      companyType: iType >= 0 ? cells[iType] : undefined,
      notes: iNotes >= 0 ? cells[iNotes] : undefined,
    });
  }
  return rows;
}

export default function ClientImport() {
  const [raw, setRaw] = useState('');
  const [updateExisting, setUpdateExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    skippedRows?: Array<{ email: string; reason: string }>;
  } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!raw.trim()) return [] as ImportRow[];
    try {
      setParseError(null);
      return parseCsv(raw).slice(0, 25);
    } catch (e: any) {
      setParseError(e?.message || 'Parse error');
      return [];
    }
  }, [raw]);

  const fullCount = useMemo(() => {
    try {
      return raw.trim() ? parseCsv(raw).length : 0;
    } catch {
      return 0;
    }
  }, [raw]);

  async function runImport() {
    setBusy(true);
    setResult(null);
    try {
      const rows = parseCsv(raw);
      if (!rows.length) {
        toast.error('No valid rows to import');
        return;
      }
      const res = (await apiClient.post('/clients/import', {
        rows,
        updateExisting,
      })) as any;
      const data = res?.data ?? res;
      setResult(data);
      toast.success(res?.message || `Imported ${data?.created ?? 0} clients`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function loadSample() {
    setRaw(SAMPLE_CSV.trim());
    setResult(null);
  }

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRaw(String(reader.result || ''));
    reader.readAsText(file);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
            <ArrowUpTrayIcon className="h-6 w-6 text-emerald-500" />
            Import clients
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            CSV switcher path from Engager-class tools — map name + email as a minimum.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/switch-from-engager" className="btn-secondary text-sm">
            Switch guide
          </Link>
          <Link to="/clients" className="btn-secondary text-sm">
            Client list
          </Link>
        </div>
      </div>

      <div className="metal-tile p-5">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="btn-secondary inline-flex cursor-pointer items-center gap-1 text-sm">
              <ArrowUpTrayIcon className="h-4 w-4" />
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] || null)}
              />
            </label>
            <button type="button" className="btn-secondary text-sm" onClick={loadSample}>
              <DocumentArrowDownIcon className="mr-1 inline h-4 w-4" />
              Load sample
            </button>
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
              />
              Update existing emails
            </label>
          </div>
          <p className="text-2xs text-slate-400">
            Columns: name, contactEmail (or email), contactName, contactPhone, companyNumber,
            companyType, notes — max 200 rows.
          </p>
          <textarea
            className="input-field min-h-[10rem] font-mono text-xs"
            placeholder="Paste CSV here…"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setResult(null);
            }}
          />
          {parseError && <p className="text-sm text-rose-600">{parseError}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-accent text-sm"
              disabled={busy || fullCount === 0 || !!parseError}
              onClick={() => void runImport()}
            >
              {busy ? 'Importing…' : `Import ${fullCount || 0} row(s)`}
            </button>
            {fullCount > 25 && (
              <span className="text-xs text-slate-500">Preview shows first 25</span>
            )}
          </div>
        </div>
      </div>

      {preview.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            Preview
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2">{r.contactEmail}</td>
                    <td className="px-3 py-2">{r.contactName || '—'}</td>
                    <td className="px-3 py-2">{r.companyType || 'LIMITED_COMPANY'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="metal-tile metal-tile--mint p-5">
          <span className="metal-specular" aria-hidden />
          <div className="relative z-[1] flex items-start gap-3">
            <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">Import finished</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {result.created} created · {result.updated} updated · {result.skipped} skipped
              </p>
              {result.skippedRows && result.skippedRows.length > 0 && (
                <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-slate-500">
                  {result.skippedRows.map((s, i) => (
                    <li key={i}>
                      {s.email}: {s.reason}
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/clients" className="btn-secondary mt-3 inline-flex text-xs">
                View clients
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
