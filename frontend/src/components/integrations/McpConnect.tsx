import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { SparklesIcon } from '@heroicons/react/24/outline';

const MCP_ROLES = new Set(['ADMIN', 'PARTNER', 'MD']);

type McpStatus = {
  endpoint: string;
  configured: boolean;
  canManage: boolean;
  key: {
    name: string;
    preview: string;
    scopes: string;
    createdAt: string;
    lastUsedAt: string | null;
  } | null;
};

export default function McpConnect() {
  const canManage = MCP_ROLES.has(useAuthStore((s) => s.user?.role) || '');
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'token' | 'claude' | 'cursor' | null>(null);

  const load = async () => {
    try {
      const res = (await apiClient.get('/integrations/mcp')) as any;
      setStatus(res?.data ?? res);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not load MCP settings');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const snippet = useMemo(() => {
    const endpoint = status?.endpoint || 'https://capstonesoftware.co.uk/engage/api/mcp';
    const shown = token || 'YOUR_ENGAGE_MCP_TOKEN';
    return {
      claude: JSON.stringify(
        {
          mcpServers: {
            engage: {
              url: endpoint,
              headers: { Authorization: `Bearer ${shown}` },
            },
          },
        },
        null,
        2
      ),
      cursor: JSON.stringify(
        {
          mcpServers: {
            engage: {
              url: endpoint,
              headers: { Authorization: `Bearer ${shown}` },
            },
          },
        },
        null,
        2
      ),
    };
  }, [status?.endpoint, token]);

  async function mint() {
    setBusy(true);
    setError(null);
    try {
      const res = (await apiClient.post('/integrations/mcp/keys', {})) as any;
      const data = res?.data ?? res;
      setToken(data.token);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e.message || 'Could not generate a key');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (
      !window.confirm(
        'Revoke the current MCP key? Connected AI tools will stop until you generate a new one.'
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.delete('/integrations/mcp/keys');
      setToken(null);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e.message || 'Could not revoke the key');
    } finally {
      setBusy(false);
    }
  }

  async function copy(kind: 'token' | 'claude' | 'cursor', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Could not copy — select the text instead');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <SparklesIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Connect your AI</h2>
          <p className="mt-1 text-sm text-slate-500">
            Give Claude, Cursor, ChatGPT, or any MCP client a key to this practice. It can read
            jobs, clients, and proposals, and add a staff note when you ask. It cannot send client
            email or change fees.
          </p>
        </div>
      </div>

      {status?.configured && status.key && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Active key {status.key.preview}
          {status.key.lastUsedAt
            ? ` · last used ${new Date(status.key.lastUsedAt).toLocaleString()}`
            : ' · not used yet'}
        </p>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-accent text-sm"
            disabled={busy}
            onClick={() => void mint()}
          >
            {busy ? 'Working…' : status?.configured ? 'Rotate key' : 'Generate MCP key'}
          </button>
          {status?.configured && (
            <button
              type="button"
              className="btn-secondary text-sm"
              disabled={busy}
              onClick={() => void revoke()}
            >
              Revoke
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Ask a partner or admin to generate a key.</p>
      )}

      {token && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/40">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            Copy this token now — it will not be shown again.
          </p>
          <code className="mt-2 block break-all text-xs text-slate-800 dark:text-slate-100">
            {token}
          </code>
          <button
            type="button"
            className="btn-secondary mt-2 text-xs"
            onClick={() => void copy('token', token)}
          >
            {copied === 'token' ? 'Copied' : 'Copy token'}
          </button>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Endpoint</p>
        <code className="mt-1 block break-all text-xs text-slate-700 dark:text-slate-200">
          {status?.endpoint}
        </code>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Snippet
          title="Claude Desktop / Claude.ai"
          value={snippet.claude}
          copied={copied === 'claude'}
          onCopy={() => void copy('claude', snippet.claude)}
        />
        <Snippet
          title="Cursor"
          value={snippet.cursor}
          copied={copied === 'cursor'}
          onCopy={() => void copy('cursor', snippet.cursor)}
        />
      </div>
    </div>
  );
}

function Snippet({
  title,
  value,
  copied,
  onCopy,
}: {
  title: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{title}</p>
        <button type="button" className="text-xs text-emerald-700" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-auto text-2xs leading-5 text-slate-700 dark:text-slate-200">
        {value}
      </pre>
    </div>
  );
}
