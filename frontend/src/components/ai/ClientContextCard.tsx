import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  PencilIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { toast } from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import { AI_COPILOT } from '../../config/aiCopilot';
import { showAiError } from './AiPanel';

export interface ClientBriefData {
  brief: string;
  highlights: string[];
  companiesHouse?: CompaniesHouseSnapshot;
  requiresApproval?: boolean;
}

export interface CompaniesHouseSnapshot {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string;
  dateOfCreation: string;
  registeredOfficeAddress?: string;
  sicCodes?: string[];
  accountsNextDue?: string;
}

export interface CompaniesHouseMatch {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string;
  dateOfCreation?: string;
}

export interface EditableClientFields {
  id: string;
  name?: string;
  companyType?: string;
  companyNumber?: string | null;
  industry?: string | null;
  employeeCount?: number | null;
  turnover?: number | null;
  notes?: string | null;
  yearEnd?: string | null;
  clientRelationship?: 'NEW' | 'EXISTING';
}

interface ClientContextCardProps {
  clientId: string;
  clientName?: string;
  companyType?: string;
  configured?: boolean;
  className?: string;
  onClientUpdated?: (fields: EditableClientFields) => void;
}

function parseDecimalInput(value: string): number | null {
  if (value === '' || value === '.') return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function formatChDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function statusColour(status: string): string {
  const s = status.toLowerCase();
  if (s === 'active') return 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40';
  if (s === 'dissolved') return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40';
  return 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40';
}

export default function ClientContextCard({
  clientId,
  clientName,
  companyType,
  configured = true,
  className = '',
  onClientUpdated,
}: ClientContextCardProps) {
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<ClientBriefData | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [chConfigured, setChConfigured] = useState<boolean | null>(null);
  const [chPulling, setChPulling] = useState(false);
  const [chData, setChData] = useState<CompaniesHouseSnapshot | null>(null);
  const [chMatches, setChMatches] = useState<CompaniesHouseMatch[] | null>(null);
  const autoPullAttempted = useRef<string | null>(null);

  const [companyNumber, setCompanyNumber] = useState('');
  const [industry, setIndustry] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [turnover, setTurnover] = useState('');
  const [notes, setNotes] = useState('');
  const [yearEnd, setYearEnd] = useState('');
  const [clientRelationship, setClientRelationship] = useState<'NEW' | 'EXISTING'>('NEW');

  const applyClientFields = useCallback((c: Record<string, unknown>) => {
    setCompanyNumber(String(c.companyNumber || ''));
    setIndustry(String(c.industry || ''));
    setEmployeeCount(c.employeeCount != null ? String(c.employeeCount) : '');
    setTurnover(c.turnover != null ? String(c.turnover) : '');
    setNotes(String(c.notes || ''));
    setYearEnd(String(c.yearEnd || ''));
    setClientRelationship(c.clientRelationship === 'EXISTING' ? 'EXISTING' : 'NEW');
  }, []);

  const loadClientDetails = useCallback(async () => {
    if (!clientId) return null;
    try {
      const res = (await apiClient.getClient(clientId)) as any;
      if (res.success && res.data) {
        applyClientFields(res.data);
        return res.data;
      }
    } catch {
      // optional
    }
    return null;
  }, [clientId, applyClientFields]);

  const loadBrief = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = (await apiClient.aiClientBrief(clientId)) as any;
      if (res.success) {
        setBrief(res.data);
        if (res.data.companiesHouse) setChData(res.data.companiesHouse);
      }
    } catch (e: any) {
      if (e?.code !== 'NOT_FOUND' && e?.status !== 404) {
        showAiError(e);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const pullFromCompaniesHouse = useCallback(
    async (opts?: { companyNumber?: string; searchByName?: boolean }) => {
      if (!clientId) return;
      setChPulling(true);
      setChMatches(null);
      try {
        const res = (await apiClient.enrichClientFromCompaniesHouse(clientId, {
          companyNumber: opts?.companyNumber,
          searchByName: opts?.searchByName ?? true,
          fillMissingOnly: true,
        })) as any;

        if (!res.success) {
          toast.error(res.error?.message || 'Companies House lookup failed');
          return;
        }

        const data = res.data;
        if (data.needsSelection && data.matches?.length) {
          setChMatches(data.matches);
          toast('Several Companies House matches — pick the right company below');
          return;
        }

        if (data.companiesHouse) setChData(data.companiesHouse);
        if (data.client) {
          applyClientFields(data.client);
          onClientUpdated?.({ id: clientId, ...data.client });
        }

        toast.success(
          data.matchedBy === 'search'
            ? 'Matched on Companies House and saved to client'
            : 'Companies House data pulled into client record'
        );
        await loadBrief();
      } catch (e: any) {
        const code = e?.response?.data?.error?.code || e?.code;
        if (code === 'NOT_CONFIGURED') {
          toast.error('Companies House API key not set on the server');
        } else if (code === 'NOT_FOUND') {
          toast.error('No Companies House match for this client');
        } else {
          toast.error(e?.response?.data?.error?.message || e.message || 'Companies House lookup failed');
        }
      } finally {
        setChPulling(false);
      }
    },
    [clientId, applyClientFields, loadBrief, onClientUpdated]
  );

  useEffect(() => {
    setBrief(null);
    setChData(null);
    setChMatches(null);
    setEditing(false);
    autoPullAttempted.current = null;

    void (async () => {
      const client = await loadClientDetails();
      if (configured && clientId) await loadBrief();
    })();
  }, [clientId, configured, loadBrief, loadClientDetails]);

  useEffect(() => {
    apiClient
      .getCompaniesHouseStatus()
      .then((res: any) => setChConfigured(!!res.data?.configured && !!res.data?.connected))
      .catch(() => setChConfigured(false));
  }, []);

  // Auto-pull CH when key is live (once per client selection)
  useEffect(() => {
    if (!chConfigured || !clientId || chPulling) return;
    if (autoPullAttempted.current === clientId) return;

    const isLtd =
      companyType === 'LIMITED_COMPANY' ||
      companyType === 'LLP' ||
      !companyType;

    if (!isLtd) return;

    autoPullAttempted.current = clientId;
    void pullFromCompaniesHouse({ searchByName: true });
  }, [chConfigured, clientId, companyType, chPulling, pullFromCompaniesHouse]);

  const refreshAll = async () => {
    await loadClientDetails();
    await loadBrief();
  };

  const saveClientContext = async () => {
    setSaving(true);
    try {
      const payload = {
        companyNumber: companyNumber.trim() || undefined,
        industry: industry.trim() || undefined,
        employeeCount: parseDecimalInput(employeeCount) ?? undefined,
        turnover: parseDecimalInput(turnover) ?? undefined,
        notes: notes.trim() || undefined,
        yearEnd: yearEnd.trim() || undefined,
        clientRelationship,
      };
      const res = (await apiClient.updateClient(clientId, payload)) as any;
      if (res.success) {
        toast.success('Client context updated');
        setEditing(false);
        onClientUpdated?.({ id: clientId, ...payload });
        if (payload.companyNumber && chConfigured) {
          await pullFromCompaniesHouse({
            companyNumber: payload.companyNumber,
            searchByName: false,
          });
        } else {
          await loadBrief();
        }
      } else {
        toast.error(res.error?.message || 'Failed to save');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const selectChMatch = (match: CompaniesHouseMatch) => {
    setCompanyNumber(match.companyNumber);
    setChMatches(null);
    void pullFromCompaniesHouse({ companyNumber: match.companyNumber, searchByName: false });
  };

  if (!configured) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/40 dark:bg-violet-950/20 p-4 ${className}`}
      >
        <div className="flex items-start gap-2">
          <SparklesIcon className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Client context</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {AI_COPILOT.unavailableMessage}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const displayCh = chData || brief?.companiesHouse;

  return (
    <div
      className={`rounded-2xl border border-violet-200 dark:border-violet-800/60 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/40 dark:to-slate-900/60 p-4 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <SparklesIcon className="h-5 w-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Client context</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {clientName ? `Brief for ${clientName}` : 'Companies House & engagement history'}
              {chConfigured && (
                <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">· CH connected</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {chConfigured && (
            <button
              type="button"
              onClick={() => void pullFromCompaniesHouse()}
              disabled={chPulling}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
              title="Pull latest from Companies House"
            >
              <BuildingOffice2Icon className={`h-3.5 w-3.5 ${chPulling ? 'animate-pulse' : ''}`} />
              {chPulling ? 'Pulling…' : 'Pull CH'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40"
            title="Edit client details"
          >
            <PencilIcon className="h-3.5 w-3.5" />
            {editing ? 'Hide' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={loading || chPulling}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 disabled:opacity-50"
            title="Refresh brief"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {chMatches && chMatches.length > 0 && (
        <div className="mb-3 p-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 space-y-2">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
            Which company on Companies House?
          </p>
          <div className="space-y-1.5">
            {chMatches.map((m) => (
              <button
                key={m.companyNumber}
                type="button"
                onClick={() => selectChMatch(m)}
                className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-600 bg-white dark:bg-slate-900 text-sm"
              >
                <span className="font-medium text-slate-900 dark:text-white">{m.companyName}</span>
                <span className="text-xs text-slate-500 ml-2">
                  {m.companyNumber} · {m.companyStatus}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {displayCh && (
        <div className="mb-3 p-3 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <BuildingOffice2Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
              {displayCh.companyName}
            </span>
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${statusColour(displayCh.companyStatus)}`}
            >
              {displayCh.companyStatus}
            </span>
            <span className="text-xs text-slate-500">#{displayCh.companyNumber}</span>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            {displayCh.dateOfCreation && (
              <>
                <dt className="text-slate-500">Incorporated</dt>
                <dd>{formatChDate(displayCh.dateOfCreation)}</dd>
              </>
            )}
            {displayCh.accountsNextDue && (
              <>
                <dt className="text-slate-500">Accounts due</dt>
                <dd>{formatChDate(displayCh.accountsNextDue)}</dd>
              </>
            )}
            {yearEnd && (
              <>
                <dt className="text-slate-500">Year end</dt>
                <dd>{yearEnd}</dd>
              </>
            )}
            {displayCh.sicCodes && displayCh.sicCodes.length > 0 && (
              <>
                <dt className="text-slate-500">SIC</dt>
                <dd>{displayCh.sicCodes.join(', ')}</dd>
              </>
            )}
          </dl>
          {displayCh.registeredOfficeAddress && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {displayCh.registeredOfficeAddress}
            </p>
          )}
        </div>
      )}

      {editing && (
        <div className="mb-4 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            These details feed {AI_COPILOT.name}&apos;s brief. Use <strong>Pull CH</strong> to import
            registered name, year end, industry (from SIC), and address from Companies House.
          </p>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Relationship with your practice
            </label>
            <div className="flex flex-wrap gap-2">
              {(['NEW', 'EXISTING'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setClientRelationship(value)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    clientRelationship === value
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200'
                      : 'border-slate-200 dark:border-slate-600'
                  }`}
                >
                  {value === 'NEW' ? 'New client' : 'Existing client'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Company number
              </label>
              <input
                type="text"
                value={companyNumber}
                onChange={(e) => setCompanyNumber(e.target.value)}
                placeholder="e.g. 12345678"
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Year end
              </label>
              <input
                type="text"
                value={yearEnd}
                onChange={(e) => setYearEnd(e.target.value)}
                placeholder="e.g. 03-31"
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Industry
              </label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Employees
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={employeeCount}
                onChange={(e) => setEmployeeCount(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Turnover (£)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={turnover}
                onChange={(e) => setTurnover(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Notes for {AI_COPILOT.name}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. family business, MTD scope, sensitive about fees…"
              className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-800 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="text-xs btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveClientContext()}
              disabled={saving}
              className="text-xs btn-primary"
            >
              {saving ? 'Saving…' : 'Save context'}
            </button>
          </div>
        </div>
      )}

      {loading && !brief ? (
        <div className="space-y-2 animate-pulse" aria-busy="true">
          <div className="h-3 bg-violet-100 dark:bg-violet-900/40 rounded w-full" />
          <div className="h-3 bg-violet-100 dark:bg-violet-900/40 rounded w-5/6" />
          <div className="h-3 bg-violet-100 dark:bg-violet-900/40 rounded w-4/6" />
          <p className="text-xs text-violet-600 dark:text-violet-400 pt-1">
            {chPulling
              ? 'Pulling Companies House data…'
              : `${AI_COPILOT.name} is researching this client…`}
          </p>
        </div>
      ) : brief ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
            {brief.brief}
          </p>
          {brief.highlights?.length > 0 && (
            <ul className="text-xs space-y-1 text-slate-600 dark:text-slate-300">
              {brief.highlights.map((h, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-violet-500 shrink-0">•</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          {chConfigured
            ? 'Pulling Companies House data or add client details, then refresh.'
            : 'Add client details and refresh for a brief.'}
        </p>
      )}
    </div>
  );
}