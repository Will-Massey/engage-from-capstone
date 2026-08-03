import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  InboxIcon,
  MagnifyingGlassIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  DevicePhoneMobileIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  LinkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { StatusChip } from '../../components/ui/StatusChip';
import { MetalCard } from '../../components/ui/MetalTile';
import { format } from 'date-fns';

type Channel = 'mailbox' | 'all' | 'email' | 'sms' | 'portal';

interface InboxItem {
  id: string;
  channel: 'email' | 'sms' | 'portal' | 'system';
  title: string;
  detail: string;
  status: string | null;
  at: string;
  clientId: string | null;
  clientName: string | null;
  to: string | null;
  proposalId: string | null;
  href: string | null;
}

interface MailboxMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  subject: string;
  body: string;
  at: string;
  read: boolean;
  clientId: string | null;
  clientName: string | null;
  threadKey: string;
  provider: string | null;
}

interface MailboxConnection {
  connected: boolean;
  provider: string | null;
  user: string | null;
  mode: string;
  canSync: boolean;
  canSend: boolean;
}

const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'mailbox', label: 'Mailbox' },
  { id: 'all', label: 'Activity' },
  { id: 'email', label: 'Delivery log' },
  { id: 'sms', label: 'SMS' },
  { id: 'portal', label: 'Portal' },
];

function channelTone(ch: string): 'info' | 'mint' | 'success' | 'neutral' {
  if (ch === 'email') return 'info';
  if (ch === 'sms') return 'mint';
  if (ch === 'portal') return 'success';
  return 'neutral';
}

export default function FirmInbox() {
  const [channel, setChannel] = useState<Channel>('mailbox');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Activity feed (legacy channels)
  const [items, setItems] = useState<InboxItem[]>([]);
  const [summary, setSummary] = useState({ emailLast7d: 0, portalLast7d: 0, shown: 0 });
  const [selectedActivity, setSelectedActivity] = useState<InboxItem | null>(null);

  // Two-way mailbox
  const [messages, setMessages] = useState<MailboxMessage[]>([]);
  const [connection, setConnection] = useState<MailboxConnection | null>(null);
  const [selectedMail, setSelectedMail] = useState<MailboxMessage | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mailContext, setMailContext] = useState<{
    client: {
      id: string;
      name: string;
      contactEmail?: string;
      contactName?: string;
    } | null;
    jobs: Array<{ id: string; reference: string; title: string; boardColumn: string }>;
    pendingForms: Array<{ id: string; templateName: string }>;
  } | null>(null);
  const [triage, setTriage] = useState<{
    category: string;
    urgency: string;
    draftReply: string;
    partnerNotes: string;
  } | null>(null);
  const [triageBusy, setTriageBusy] = useState(false);
  const [formTemplates, setFormTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [clientsForLink, setClientsForLink] = useState<Array<{ id: string; name: string }>>([]);
  const [linkClientId, setLinkClientId] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const loadMailbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (q.trim()) params.set('q', q.trim());
      if (unreadOnly) params.set('unread', '1');
      const res = (await apiClient.get(`/comms/mailbox/messages?${params}`)) as any;
      const data = res?.data ?? res;
      setMessages(data?.messages || []);
      setConnection(data?.connection || null);
      setSelectedMail((prev) => {
        if (!prev) return null;
        return (data?.messages || []).find((m: MailboxMessage) => m.id === prev.id) || null;
      });
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Failed to load mailbox');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [q, unreadOnly]);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      params.set('channel', channel === 'all' ? 'all' : channel);
      if (q.trim()) params.set('q', q.trim());
      const res = (await apiClient.get(`/comms/inbox?${params}`)) as any;
      const data = res?.data ?? res;
      setItems(data?.items || []);
      setSummary(data?.summary || { emailLast7d: 0, portalLast7d: 0, shown: 0 });
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Failed to load inbox');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [channel, q]);

  useEffect(() => {
    const t = setTimeout(
      () => {
        if (channel === 'mailbox') void loadMailbox();
        else void loadActivity();
      },
      q ? 250 : 0
    );
    return () => clearTimeout(t);
  }, [channel, q, loadMailbox, loadActivity]);

  // Auto-sync once when opening mailbox empty
  useEffect(() => {
    if (channel !== 'mailbox' || loading) return;
    if (messages.length === 0 && !syncMsg) {
      void (async () => {
        try {
          const res = (await apiClient.post('/comms/mailbox/sync', {})) as any;
          setSyncMsg(res?.message || res?.data?.message || 'Synced');
          await loadMailbox();
        } catch {
          /* ignore first-load seed errors */
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = (await apiClient.post('/comms/mailbox/sync', {})) as any;
      setSyncMsg(res?.message || res?.data?.message || 'Synced');
      await loadMailbox();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleReply() {
    if (!selectedMail || !replyBody.trim()) return;
    setSending(true);
    try {
      await apiClient.post('/comms/mailbox/send', {
        to: selectedMail.direction === 'inbound' ? selectedMail.from : selectedMail.to,
        subject: selectedMail.subject,
        body: replyBody.trim(),
        clientId: selectedMail.clientId,
        inReplyToId: selectedMail.id,
      });
      setReplyBody('');
      await loadMailbox();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  }

  async function handleCompose() {
    if (!compose.to.trim() || !compose.subject.trim() || !compose.body.trim()) return;
    setSending(true);
    try {
      await apiClient.post('/comms/mailbox/send', {
        to: compose.to.trim(),
        subject: compose.subject.trim(),
        body: compose.body.trim(),
      });
      setCompose({ to: '', subject: '', body: '' });
      setComposeOpen(false);
      await loadMailbox();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  }

  async function openMail(m: MailboxMessage) {
    setSelectedMail(m);
    setComposeOpen(false);
    setTriage(null);
    setMailContext(null);
    if (m.direction === 'inbound' && !m.read) {
      try {
        await apiClient.post(`/comms/mailbox/messages/${m.id}/read`, {});
        setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, read: true } : x)));
      } catch {
        /* non-fatal */
      }
    }
    try {
      const res = (await apiClient.get(`/comms/mailbox/messages/${m.id}/context`)) as any;
      const data = res?.data ?? res;
      setMailContext({
        client: data?.client || null,
        jobs: data?.jobs || [],
        pendingForms: data?.pendingForms || [],
      });
    } catch {
      setMailContext(null);
    }
  }

  async function runTriage() {
    if (!selectedMail) return;
    setTriageBusy(true);
    try {
      const res = (await apiClient.post('/ai/reply-triage', {
        from: selectedMail.from,
        subject: selectedMail.subject,
        body: selectedMail.body,
        clientName: selectedMail.clientName || mailContext?.client?.name,
      })) as any;
      const data = res?.data ?? res;
      setTriage(data);
      if (data?.draftReply) setReplyBody(data.draftReply);
    } catch (e: any) {
      setError(e?.message || 'Clara triage unavailable');
    } finally {
      setTriageBusy(false);
    }
  }

  useEffect(() => {
    if (channel !== 'mailbox') return;
    void (async () => {
      try {
        const res = (await apiClient.get('/forms/templates')) as any;
        const tpls = res?.data?.templates || res?.templates || [];
        setFormTemplates(tpls.map((t: any) => ({ id: t.id, name: t.name })));
      } catch {
        /* optional */
      }
    })();
  }, [channel]);

  const threadMessages = useMemo(() => {
    if (!selectedMail) return [];
    return messages
      .filter((m) => m.threadKey === selectedMail.threadKey)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [messages, selectedMail]);

  const unread = messages.filter((m) => m.direction === 'inbound' && !m.read).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            <InboxIcon className="h-6 w-6 text-emerald-500" aria-hidden />
            Inbox
            {unread > 0 && channel === 'mailbox' && (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">
                {unread}
              </span>
            )}
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-slate-500">
            Two-way mailbox — reply in-thread, sync Gmail/M365, or use local threads until OAuth is
            connected.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {channel === 'mailbox' && (
            <>
              <button
                type="button"
                className={`btn-secondary text-sm ${unreadOnly ? 'ring-2 ring-emerald-500' : ''}`}
                onClick={() => setUnreadOnly((v) => !v)}
                title="Show unread inbound only"
              >
                Unread only
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={syncing}
                onClick={() => void handleSync()}
              >
                <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                Sync
              </button>
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => {
                  setComposeOpen(true);
                  setSelectedMail(null);
                }}
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                Compose
              </button>
            </>
          )}
          <Link to="/settings?tab=email" className="btn-ghost text-sm">
            <LinkIcon className="h-4 w-4" />
            Connect mail
          </Link>
          <Link to="/forms" className="btn-secondary text-sm">
            Bulk forms
          </Link>
        </div>
      </div>

      {/* Connection strip */}
      {channel === 'mailbox' && connection && (
        <div
          className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
            connection.canSync
              ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
              : 'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
          }`}
        >
          {connection.canSync ? (
            <StatusChip tone="success">
              {connection.provider} · {connection.user || 'connected'}
            </StatusChip>
          ) : (
            <>
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                Local / platform mode — connect <strong>Gmail</strong> or{' '}
                <strong>Microsoft 365</strong> in Settings for live two-way sync.
              </span>
            </>
          )}
          {syncMsg && <span className="text-xs opacity-80 ml-auto">{syncMsg}</span>}
        </div>
      )}

      {channel !== 'mailbox' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <MetalCard tone="sky" className="p-4">
            <p className="metal-kicker">Email · 7 days</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.emailLast7d}</p>
          </MetalCard>
          <MetalCard tone="mint" className="p-4">
            <p className="metal-kicker">Portal · 7 days</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.portalLast7d}</p>
          </MetalCard>
          <MetalCard className="p-4">
            <p className="metal-kicker">Showing</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.shown || items.length}</p>
          </MetalCard>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input-field w-full pl-9 text-sm"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search inbox"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                channel === c.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
              onClick={() => setChannel(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {channel === 'mailbox' ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(18rem,26rem)]">
          <div className="metal-tile overflow-hidden p-0">
            <span className="metal-specular" aria-hidden />
            {loading && messages.length === 0 ? (
              <div className="relative z-[1] space-y-2 p-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton h-14" />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="relative z-[1] px-6 py-16 text-center">
                <InboxIcon className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">Mailbox is empty</p>
                <p className="mt-1 text-xs text-slate-500">
                  Hit Sync to seed client threads, or Compose a message.
                </p>
              </div>
            ) : (
              <ul className="relative z-[1] max-h-[min(70vh,36rem)] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {messages.map((m) => {
                  const active = selectedMail?.id === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 ${
                          active ? 'bg-emerald-50/80 dark:bg-emerald-950/30' : ''
                        } ${!m.read && m.direction === 'inbound' ? 'font-semibold' : ''}`}
                        onClick={() => void openMail(m)}
                      >
                        <span
                          className={`mt-0.5 rounded-lg p-1.5 shadow-sm ${
                            m.direction === 'inbound'
                              ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40'
                          }`}
                        >
                          <EnvelopeIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <StatusChip tone={m.direction === 'inbound' ? 'info' : 'success'}>
                              {m.direction}
                            </StatusChip>
                            {!m.read && m.direction === 'inbound' && (
                              <span
                                className="h-2 w-2 rounded-full bg-rose-500"
                                aria-label="Unread"
                              />
                            )}
                            <span className="ml-auto text-2xs tabular-nums text-slate-400">
                              {format(new Date(m.at), 'dd MMM HH:mm')}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-slate-900 dark:text-slate-50">
                            {m.subject}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {m.clientName || (m.direction === 'inbound' ? m.from : m.to)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <aside className="metal-tile p-5">
            <span className="metal-specular" aria-hidden />
            <div className="relative z-[1] space-y-3">
              {composeOpen ? (
                <>
                  <p className="metal-kicker">Compose</p>
                  <input
                    className="input-field text-sm"
                    placeholder="To (email)"
                    value={compose.to}
                    onChange={(e) => setCompose((c) => ({ ...c, to: e.target.value }))}
                  />
                  <input
                    className="input-field text-sm"
                    placeholder="Subject"
                    value={compose.subject}
                    onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))}
                  />
                  <textarea
                    className="input-field min-h-[8rem] text-sm"
                    placeholder="Message…"
                    value={compose.body}
                    onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary text-sm"
                      disabled={sending}
                      onClick={() => void handleCompose()}
                    >
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-sm"
                      onClick={() => setComposeOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : !selectedMail ? (
                <p className="text-sm text-slate-500">Select a message or compose.</p>
              ) : (
                <>
                  <p className="metal-kicker">Thread</p>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    {selectedMail.subject}
                  </h2>

                  {/* Manual client link when auto-match missed */}
                  {!mailContext?.client && selectedMail && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/20">
                      <p className="font-semibold text-amber-900 dark:text-amber-200">
                        No client matched
                      </p>
                      <p className="mt-0.5 text-slate-500">
                        Link this thread to a client for jobs, forms, and timeline.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <select
                          className="input-field max-w-xs flex-1 py-1 text-xs"
                          value={linkClientId}
                          onChange={(e) => setLinkClientId(e.target.value)}
                          onFocus={() => {
                            if (clientsForLink.length) return;
                            void (async () => {
                              try {
                                const res = (await apiClient.get('/clients?limit=100')) as any;
                                const list = res?.data || res || [];
                                setClientsForLink(
                                  (Array.isArray(list) ? list : list.data || []).map(
                                    (c: any) => ({
                                      id: c.id,
                                      name: c.name || c.company_name || 'Client',
                                    })
                                  )
                                );
                              } catch {
                                /* ignore */
                              }
                            })();
                          }}
                        >
                          <option value="">Select client…</option>
                          {clientsForLink.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-secondary btn-sm !min-h-8 !py-1 text-2xs"
                          disabled={!linkClientId}
                          onClick={async () => {
                            if (!selectedMail || !linkClientId) return;
                            try {
                              const res = (await apiClient.post(
                                `/comms/mailbox/messages/${selectedMail.id}/link-client`,
                                { clientId: linkClientId }
                              )) as any;
                              setSyncMsg(res?.message || 'Linked to client');
                              setLinkClientId('');
                              await loadMailbox();
                              await openMail({ ...selectedMail, clientId: linkClientId });
                            } catch (e: any) {
                              setError(e?.message || 'Link failed');
                            }
                          }}
                        >
                          Link client
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Graph context */}
                  {mailContext?.client && (
                    <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 p-3 text-xs dark:border-emerald-900 dark:bg-emerald-950/20">
                      <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                        {mailContext.client.name}
                      </p>
                      <p className="text-slate-500">{mailContext.client.contactEmail}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Link
                          to={`/clients/${mailContext.client.id}?tab=comms`}
                          className="btn-ghost btn-sm !min-h-8 !py-1 text-2xs"
                        >
                          Client
                        </Link>
                        {mailContext.jobs[0] && (
                          <Link
                            to={`/jobs/${mailContext.jobs[0].id}`}
                            className="btn-ghost btn-sm !min-h-8 !py-1 text-2xs"
                          >
                            Job {mailContext.jobs[0].reference}
                          </Link>
                        )}
                        <button
                          type="button"
                          className="btn-secondary btn-sm !min-h-8 !py-1 text-2xs"
                          onClick={async () => {
                            try {
                              await apiClient.post(
                                `/comms/mailbox/messages/${selectedMail.id}/create-task`,
                                {}
                              );
                              setSyncMsg('Portal task created from email');
                            } catch (e: any) {
                              setError(e?.message || 'Task failed');
                            }
                          }}
                        >
                          Create task
                        </button>
                        {formTemplates[0] && (
                          <button
                            type="button"
                            className="btn-secondary btn-sm !min-h-8 !py-1 text-2xs"
                            onClick={async () => {
                              try {
                                await apiClient.post(
                                  `/comms/mailbox/messages/${selectedMail.id}/assign-form`,
                                  { templateId: formTemplates[0].id, dueInDays: 7 }
                                );
                                setSyncMsg(`Form assigned: ${formTemplates[0].name}`);
                              } catch (e: any) {
                                setError(e?.message || 'Assign failed');
                              }
                            }}
                          >
                            Assign form
                          </button>
                        )}
                      </div>
                      {mailContext.jobs.length > 0 && (
                        <p className="mt-2 text-2xs text-slate-500">
                          Open jobs:{' '}
                          {mailContext.jobs
                            .map((j) => `${j.reference} (${j.boardColumn})`)
                            .join(' · ')}
                        </p>
                      )}
                      {mailContext.pendingForms.length > 0 && (
                        <p className="mt-1 text-2xs text-amber-700">
                          Pending forms:{' '}
                          {mailContext.pendingForms.map((f) => f.templateName).join(', ')}
                        </p>
                      )}
                    </div>
                  )}

                  <ul className="max-h-48 space-y-2 overflow-y-auto">
                    {threadMessages.map((m) => (
                      <li
                        key={m.id}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          m.direction === 'inbound'
                            ? 'bg-sky-50 text-slate-800 dark:bg-sky-950/30 dark:text-slate-100'
                            : 'bg-emerald-50 text-slate-800 dark:bg-emerald-950/30 dark:text-slate-100'
                        }`}
                      >
                        <p className="text-2xs font-semibold uppercase tracking-wide text-slate-400">
                          {m.direction === 'inbound' ? m.from : 'You → ' + m.to} ·{' '}
                          {format(new Date(m.at), 'dd MMM HH:mm')}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={triageBusy}
                      onClick={() => void runTriage()}
                    >
                      {triageBusy ? 'Clara…' : 'Clara draft reply'}
                    </button>
                  </div>
                  {triage && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2 text-xs dark:border-violet-900 dark:bg-violet-950/30">
                      <p className="font-semibold text-violet-900 dark:text-violet-200">
                        {triage.category} · {triage.urgency}
                      </p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">
                        {triage.partnerNotes}
                      </p>
                    </div>
                  )}

                  <textarea
                    className="input-field min-h-[5rem] text-sm"
                    placeholder="Write a reply…"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-primary text-sm"
                    disabled={sending || !replyBody.trim()}
                    onClick={() => void handleReply()}
                  >
                    {sending ? 'Sending…' : 'Send reply'}
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      ) : (
        /* Activity feed */
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(16rem,22rem)]">
          <div className="metal-tile overflow-hidden p-0">
            <span className="metal-specular" aria-hidden />
            {loading && items.length === 0 ? (
              <div className="relative z-[1] space-y-2 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-14" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="relative z-[1] px-6 py-12 text-center text-sm text-slate-500">
                No activity in this filter.
              </div>
            ) : (
              <ul className="relative z-[1] max-h-[min(70vh,36rem)] divide-y divide-slate-100 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`flex w-full cursor-pointer gap-3 px-4 py-3 text-left hover:bg-emerald-50/60 ${
                        selectedActivity?.id === item.id ? 'bg-emerald-50/80' : ''
                      }`}
                      onClick={() => setSelectedActivity(item)}
                    >
                      <span className="mt-0.5 rounded-lg bg-white p-1.5 text-slate-500 shadow-sm dark:bg-slate-800">
                        {item.channel === 'sms' ? (
                          <DevicePhoneMobileIcon className="h-4 w-4" />
                        ) : item.channel === 'portal' ? (
                          <ChatBubbleLeftRightIcon className="h-4 w-4" />
                        ) : (
                          <EnvelopeIcon className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <StatusChip tone={channelTone(item.channel)}>{item.channel}</StatusChip>
                        <span className="mt-0.5 block truncate text-sm font-semibold">
                          {item.title}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {item.clientName || item.detail}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <aside className="metal-tile p-5">
            <span className="metal-specular" aria-hidden />
            <div className="relative z-[1]">
              {!selectedActivity ? (
                <p className="text-sm text-slate-500">Select an activity item.</p>
              ) : (
                <div className="space-y-2">
                  <StatusChip tone={channelTone(selectedActivity.channel)}>
                    {selectedActivity.channel}
                  </StatusChip>
                  <h2 className="font-semibold text-slate-900 dark:text-white">
                    {selectedActivity.title}
                  </h2>
                  <p className="text-sm text-slate-600">{selectedActivity.detail}</p>
                  {selectedActivity.clientId && (
                    <Link
                      to={`/clients/${selectedActivity.clientId}?tab=comms`}
                      className="btn-accent text-sm"
                    >
                      Open client
                    </Link>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
