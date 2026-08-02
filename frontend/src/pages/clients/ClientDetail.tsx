import { useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  PencilIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  BuildingOfficeIcon,
  ClockIcon,
  XMarkIcon,
  UserIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  CalendarIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { format, formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import AmlPartnerPanel from '../../components/clients/AmlPartnerPanel';
import LoeOnlyModal from '../../components/proposals/LoeOnlyModal';
import {
  StatusChip,
  MoneyPill,
  ProgressRing,
  boardColumnLabel,
  boardColumnTone,
} from '../../components/ui/StatusChip';

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { tenant } = useAuthStore();
  const [client, setClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    tabFromUrl &&
      ['overview', 'jobs', 'proposals', 'comms', 'mtditsa', 'documents', 'lifecycle'].includes(
        tabFromUrl
      )
      ? tabFromUrl
      : 'overview'
  );

  useEffect(() => {
    if (
      tabFromUrl &&
      ['overview', 'jobs', 'proposals', 'comms', 'mtditsa', 'documents', 'lifecycle'].includes(
        tabFromUrl
      )
    ) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifyingId, setIsVerifyingId] = useState(false);
  const [showLoeOnlyModal, setShowLoeOnlyModal] = useState(false);
  const [clientJobs, setClientJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [commsEvents, setCommsEvents] = useState<
    Array<{
      id: string;
      channel: string;
      at: string;
      title: string;
      detail: string;
      status?: string;
    }>
  >([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsBusy, setSmsBusy] = useState(false);
  const [portalTasks, setPortalTasks] = useState<
    Array<{ id: string; title: string; done: boolean; dueAt: string | null; from: string }>
  >([]);
  const [portalMessages, setPortalMessages] = useState<
    Array<{ id: string; body: string; createdAt: string; from: string; authorName?: string }>
  >([]);
  const [portalTaskDraft, setPortalTaskDraft] = useState('');
  const [portalMsgDraft, setPortalMsgDraft] = useState('');
  const [portalOsBusy, setPortalOsBusy] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    contactEmail: '',
    contactName: '',
    contactPhone: '',
    companyType: '',
    industry: '',
    companyNumber: '',
    utr: '',
    vatNumber: '',
    employeeCount: 0,
    turnover: 0,
    addressLine1: '',
    addressLine2: '',
    city: '',
    postcode: '',
    clientRelationship: 'NEW' as 'NEW' | 'EXISTING',
  });

  useEffect(() => {
    if (id) {
      loadClient();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id || activeTab !== 'jobs') return;
    let cancelled = false;
    (async () => {
      setJobsLoading(true);
      try {
        const res = await apiClient.get('/jobs', { params: { clientId: id } });
        const data = res.data?.data ?? res.data;
        if (!cancelled) setClientJobs(data.jobs || []);
      } catch {
        if (!cancelled) setClientJobs([]);
      } finally {
        if (!cancelled) setJobsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeTab]);

  useEffect(() => {
    if (!id || activeTab !== 'comms') return;
    let cancelled = false;
    (async () => {
      setCommsLoading(true);
      try {
        const res = (await apiClient.get(`/clients/${id}/comms-timeline`)) as any;
        const data = res?.data ?? res;
        if (!cancelled) {
          setCommsEvents(data?.events || []);
          setSmsConfigured(!!data?.smsConfigured);
        }
      } catch {
        if (!cancelled) setCommsEvents([]);
      } finally {
        if (!cancelled) setCommsLoading(false);
      }
      try {
        const os = (await apiClient.get(`/clients/${id}/portal-os`)) as any;
        const data = os?.data ?? os;
        if (!cancelled) {
          setPortalTasks(data?.tasks || []);
          setPortalMessages(data?.messages || []);
        }
      } catch {
        if (!cancelled) {
          setPortalTasks([]);
          setPortalMessages([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, activeTab]);

  const refreshPortalOs = async () => {
    if (!id) return;
    try {
      const os = (await apiClient.get(`/clients/${id}/portal-os`)) as any;
      const data = os?.data ?? os;
      setPortalTasks(data?.tasks || []);
      setPortalMessages(data?.messages || []);
    } catch {
      /* ignore */
    }
  };

  const sendClientSms = async () => {
    if (!id || !smsText.trim()) return;
    setSmsBusy(true);
    try {
      const res = (await apiClient.post(`/clients/${id}/sms`, {
        message: smsText.trim(),
        send: true,
      })) as any;
      toast.success(res?.message || 'SMS processed');
      setSmsText('');
      const tl = (await apiClient.get(`/clients/${id}/comms-timeline`)) as any;
      setCommsEvents(tl?.data?.events || tl?.events || []);
      setSmsConfigured(!!(tl?.data?.smsConfigured ?? tl?.smsConfigured));
    } catch {
      /* interceptor */
    } finally {
      setSmsBusy(false);
    }
  };

  const loadClient = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.getClient(id!)) as any;
      setClient(response.data);
    } catch (error) {
      // Error handled by UI
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = () => {
    if (!client) return;

    setEditForm({
      name: client.name || '',
      contactEmail: client.contactEmail || '',
      contactName: client.contactName || '',
      contactPhone: client.contactPhone || '',
      companyType: client.companyType || '',
      industry: client.industry || '',
      companyNumber: client.companyNumber || '',
      utr: client.utr || '',
      vatNumber: client.vatNumber || '',
      employeeCount: client.employeeCount || 0,
      turnover: client.turnover || 0,
      addressLine1: client.address?.line1 || '',
      addressLine2: client.address?.line2 || '',
      city: client.address?.city || '',
      postcode: client.address?.postcode || '',
      clientRelationship: client.clientRelationship === 'EXISTING' ? 'EXISTING' : 'NEW',
    });
    setShowEditModal(true);
  };

  const handleRequestIdVerification = async () => {
    if (!id) return;
    try {
      setIsVerifyingId(true);
      const response = (await apiClient.verifyClientIdentity(id)) as any;
      const link = response?.data?.verificationLink;
      if (link) {
        await navigator.clipboard.writeText(link);
        toast.success('ID verification link copied to clipboard');
      } else {
        toast.success(response?.message || 'ID verification requested');
      }
    } catch {
      // Error handled by API interceptor
    } finally {
      setIsVerifyingId(false);
    }
  };

  const handleUpdateClient = async () => {
    try {
      setIsSaving(true);
      const updateData = {
        name: editForm.name,
        contactEmail: editForm.contactEmail,
        contactName: editForm.contactName?.trim() ? editForm.contactName.trim() : null,
        contactPhone: editForm.contactPhone,
        companyType: editForm.companyType,
        industry: editForm.industry,
        companyNumber: editForm.companyNumber,
        utr: editForm.utr,
        vatNumber: editForm.vatNumber,
        employeeCount: Number(editForm.employeeCount),
        turnover: Number(editForm.turnover),
        address: {
          line1: editForm.addressLine1,
          line2: editForm.addressLine2 || undefined,
          city: editForm.city,
          postcode: editForm.postcode,
          country: 'United Kingdom',
        },
        clientRelationship: editForm.clientRelationship,
      };

      await apiClient.updateClient(id!, updateData);
      toast.success('Client updated successfully');
      setShowEditModal(false);
      loadClient();
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Client not found</h2>
        <Link to="/clients" className="mt-4 text-primary-600 hover:text-primary-500">
          Back to clients
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header — back link + breadcrumbs come from the global page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center">
          <div className="p-3 bg-primary-100 rounded-lg">
            <BuildingOfficeIcon className="h-8 w-8 text-primary-600" />
          </div>
          <div className="ml-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{client.name}</h1>
            <p className="text-sm text-slate-600">
              {client.companyType?.replace(/_/g, ' ')} • {client.industry || 'No industry set'}
              {client.clientRelationship && (
                <span className="ml-2 text-xs font-medium text-primary-700 dark:text-primary-300">
                  • {client.clientRelationship === 'EXISTING' ? 'Existing client' : 'New client'}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to={`/proposals/new?clientId=${client.id}`}
            className="btn-primary"
            style={{ backgroundColor: tenant?.primaryColor || '#0ea5e9' }}
          >
            <DocumentTextIcon className="h-4 w-4 mr-2" />
            New Proposal
          </Link>
          <button type="button" onClick={() => setShowLoeOnlyModal(true)} className="btn-secondary">
            <DocumentTextIcon className="h-4 w-4 mr-2" />
            Send engagement letter only
          </button>
          <button
            onClick={handleRequestIdVerification}
            disabled={isVerifyingId}
            className="btn-secondary"
          >
            <UserIcon className="h-4 w-4 mr-2" />
            {isVerifyingId ? 'Requesting…' : 'Request ID verification'}
          </button>
          <button onClick={openEditModal} className="btn-secondary">
            <PencilIcon className="h-4 w-4 mr-2" />
            Edit
          </button>
        </div>
      </div>

      {/* MTD ITSA Alert */}
      {client.mtditsaEligible && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
          <ClockIcon className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">MTD ITSA Compliance Required</h3>
            <p className="mt-1 text-sm text-blue-700">
              This client has an estimated income of £{client.mtditsaIncome?.toLocaleString()}
              and must comply with Making Tax Digital for Income Tax Self Assessment.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {['overview', 'jobs', 'proposals', 'comms', 'mtditsa', 'documents', 'lifecycle'].map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                  activeTab === tab
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-slate-600 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                {tab === 'mtditsa' ? 'MTD ITSA' : tab === 'comms' ? 'Comms' : tab}
              </button>
            )
          )}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Contact Information
            </h2>
            <div className="space-y-3">
              {client.contactName && (
                <div className="flex items-center">
                  <UserIcon className="h-5 w-5 text-slate-400 mr-3" />
                  <span className="text-sm text-slate-900 dark:text-slate-100">
                    {client.contactName}
                  </span>
                </div>
              )}
              <div className="flex items-center">
                <EnvelopeIcon className="h-5 w-5 text-slate-400 mr-3" />
                <span className="text-sm text-slate-900 dark:text-slate-100">
                  {client.contactEmail}
                </span>
              </div>
              {client.contactPhone && (
                <div className="flex items-center">
                  <PhoneIcon className="h-5 w-5 text-slate-400 mr-3" />
                  <span className="text-sm text-slate-900 dark:text-slate-100">
                    {client.contactPhone}
                  </span>
                </div>
              )}
              {client.address && (
                <div className="flex items-start">
                  <MapPinIcon className="h-5 w-5 text-slate-400 mr-3 mt-0.5" />
                  <span className="text-sm text-slate-900 dark:text-slate-100">
                    {client.address.line1}
                    {client.address.line2 && <>, {client.address.line2}</>}
                    <br />
                    {client.address.city}, {client.address.postcode}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Company Details */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Company Details
            </h2>
            <div className="space-y-3">
              {client.companyNumber && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Company Number</span>
                  <span className="text-sm text-slate-900 dark:text-slate-100">
                    {client.companyNumber}
                  </span>
                </div>
              )}
              {client.utr && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">UTR</span>
                  <span className="text-sm text-slate-900 dark:text-slate-100">{client.utr}</span>
                </div>
              )}
              {client.vatNumber && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">VAT Number</span>
                  <span className="text-sm text-slate-900 dark:text-slate-100">
                    {client.vatNumber}
                  </span>
                </div>
              )}
              {client.employeeCount && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Employees</span>
                  <span className="text-sm text-slate-900 dark:text-slate-100">
                    {client.employeeCount}
                  </span>
                </div>
              )}
              {client.turnover && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Turnover</span>
                  <span className="text-sm text-slate-900 dark:text-slate-100">
                    £{client.turnover.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Statistics
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {client.proposals?.length || 0}
                </p>
                <p className="text-xs text-slate-600">Total Proposals</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {client.proposals?.filter((p: any) => p.status === 'ACCEPTED').length || 0}
                </p>
                <p className="text-xs text-slate-600">Accepted</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'comms' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="metal-tile p-5">
              <span className="metal-specular" aria-hidden />
              <div className="relative z-[1]">
                <p className="metal-kicker">Portal tasks</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  Client checklist
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Visible in the client portal. Client can tick items off.
                </p>
                <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
                  {portalTasks.length === 0 && (
                    <li className="text-xs text-slate-500">No portal tasks yet.</li>
                  )}
                  {portalTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={t.done}
                        disabled={portalOsBusy}
                        onChange={async () => {
                          if (!id) return;
                          setPortalOsBusy(true);
                          try {
                            await apiClient.patch(`/clients/${id}/portal-os/tasks/${t.id}`, {
                              done: !t.done,
                            });
                            await refreshPortalOs();
                          } finally {
                            setPortalOsBusy(false);
                          }
                        }}
                      />
                      <span className={t.done ? 'text-slate-400 line-through' : ''}>{t.title}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  <input
                    className="input-field flex-1 text-sm"
                    placeholder="e.g. Upload bank statements"
                    value={portalTaskDraft}
                    onChange={(e) => setPortalTaskDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    disabled={portalOsBusy || !portalTaskDraft.trim()}
                    onClick={async () => {
                      if (!id || !portalTaskDraft.trim()) return;
                      setPortalOsBusy(true);
                      try {
                        await apiClient.post(`/clients/${id}/portal-os/tasks`, {
                          title: portalTaskDraft.trim(),
                        });
                        setPortalTaskDraft('');
                        await refreshPortalOs();
                        toast.success('Portal task added');
                      } finally {
                        setPortalOsBusy(false);
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            <div className="metal-tile p-5">
              <span className="metal-specular" aria-hidden />
              <div className="relative z-[1]">
                <p className="metal-kicker">Portal messages</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  Secure thread
                </h3>
                <ul className="mt-3 max-h-40 space-y-1.5 overflow-y-auto">
                  {portalMessages.length === 0 && (
                    <li className="text-xs text-slate-500">No portal messages yet.</li>
                  )}
                  {portalMessages.map((m) => (
                    <li
                      key={m.id}
                      className={`rounded-md px-2 py-1.5 text-xs ${
                        m.from === 'client'
                          ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30'
                          : 'bg-slate-50 text-slate-700 dark:bg-slate-800'
                      }`}
                    >
                      <span className="font-semibold">
                        {m.from === 'client' ? 'Client' : m.authorName || 'Staff'}:
                      </span>{' '}
                      {m.body}
                    </li>
                  ))}
                </ul>
                <textarea
                  className="input-field mt-3 min-h-[3rem] text-sm"
                  placeholder="Reply via portal…"
                  value={portalMsgDraft}
                  onChange={(e) => setPortalMsgDraft(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-accent mt-2 text-sm"
                  disabled={portalOsBusy || !portalMsgDraft.trim()}
                  onClick={async () => {
                    if (!id || !portalMsgDraft.trim()) return;
                    setPortalOsBusy(true);
                    try {
                      await apiClient.post(`/clients/${id}/portal-os/messages`, {
                        body: portalMsgDraft.trim(),
                      });
                      setPortalMsgDraft('');
                      await refreshPortalOs();
                      toast.success('Portal message sent');
                    } finally {
                      setPortalOsBusy(false);
                    }
                  }}
                >
                  Send to portal
                </button>
                <Link to="/inbox" className="mt-2 block text-xs text-emerald-700 hover:underline">
                  View firm inbox →
                </Link>
              </div>
            </div>
          </div>

          <div className="metal-tile p-5">
            <span className="metal-specular" aria-hidden />
            <div className="relative z-[1]">
              <p className="metal-kicker">SMS</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                Text client
                {!smsConfigured && (
                  <span className="ml-2 text-xs font-normal text-amber-700">
                    (Twilio not configured — saves draft)
                  </span>
                )}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                To: {client.contactPhone || 'No phone on file'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  {
                    id: 'records',
                    label: 'Records chase',
                    text: `Hi${client.contactName ? ` ${String(client.contactName).split(' ')[0]}` : ''}, just a quick reminder we still need your records pack for ${client.name}. Upload via your portal when you can — thanks.`,
                  },
                  {
                    id: 'appt',
                    label: 'Appointment',
                    text: `Hi${client.contactName ? ` ${String(client.contactName).split(' ')[0]}` : ''}, confirming our call about ${client.name}. Reply if you need to reschedule.`,
                  },
                  {
                    id: 'payment',
                    label: 'Payment nudge',
                    text: `Hi${client.contactName ? ` ${String(client.contactName).split(' ')[0]}` : ''}, a payment for ${client.name} needs attention. Check your email for the secure link, or reply here and we'll help.`,
                  },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-0.5 text-2xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-800 dark:border-slate-600 dark:bg-slate-800"
                    onClick={() => setSmsText(t.text)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                className="input-field mt-3 min-h-[4rem] text-sm"
                placeholder="Short chase or appointment reminder…"
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                disabled={!client.contactPhone}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-accent text-sm"
                  disabled={smsBusy || !smsText.trim() || !client.contactPhone}
                  onClick={() => void sendClientSms()}
                >
                  {smsBusy ? 'Sending…' : smsConfigured ? 'Send SMS' : 'Save SMS draft'}
                </button>
                <span className="text-2xs text-slate-400">
                  {smsText.length}/1600 · templates fill the box first
                </span>
              </div>
            </div>
          </div>

          <div className="metal-tile p-5">
            <span className="metal-specular" aria-hidden />
            <div className="relative z-[1]">
              <p className="metal-kicker">Timeline</p>
              <h3 className="mt-1 mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                Email · SMS · dunning
              </h3>
              {commsLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : commsEvents.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No email or SMS activity logged for this client yet.
                </p>
              ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto">
                  {commsEvents.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-lg border border-slate-200/70 bg-white/60 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900/40"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip
                          tone={
                            ev.channel === 'email'
                              ? 'info'
                              : ev.channel === 'sms'
                                ? 'mint'
                                : 'danger'
                          }
                        >
                          {ev.channel}
                        </StatusChip>
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {ev.title}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{ev.detail}</p>
                      <p className="text-2xs text-slate-400">
                        {format(new Date(ev.at), 'dd MMM yyyy HH:mm')}
                        {ev.status ? ` · ${ev.status}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'jobs' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          {jobsLoading ? (
            <div className="h-32 animate-pulse bg-slate-50 dark:bg-slate-900/40" />
          ) : clientJobs.length === 0 ? (
            <div className="text-center py-12 px-4">
              <BriefcaseIcon className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
                No delivery jobs yet
              </h3>
              <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                Jobs appear when this client accepts a proposal. Track phases, deadlines, and time
                from the board.
              </p>
              <Link to="/jobs" className="mt-4 btn-secondary inline-flex text-sm">
                Open jobs board
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {clientJobs.map((job: any) => {
                const phases = job.phases || [];
                const pct =
                  phases.length === 0
                    ? 0
                    : Math.round(
                        phases.reduce((a: number, p: any) => a + (p.progressPct || 0), 0) /
                          phases.length
                      );
                const overdue = job.dueAt && new Date(job.dueAt) < new Date();
                return (
                  <Link
                    key={job.id}
                    to={`/jobs/${job.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                  >
                    <div className="min-w-0 flex items-start gap-3">
                      <ProgressRing pct={pct} size={32} stroke={3} />
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {job.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {job.reference}
                          {job.proposal?.reference ? ` · ${job.proposal.reference}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone={boardColumnTone(job.boardColumn)}>
                        {boardColumnLabel(job.boardColumn)}
                      </StatusChip>
                      {job.dueAt && (
                        <StatusChip tone={overdue ? 'danger' : 'info'}>
                          {format(new Date(job.dueAt), 'dd MMM yyyy')}
                        </StatusChip>
                      )}
                      <MoneyPill pence={job.proposedFeePence || 0} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'proposals' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          {client.proposals?.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">No proposals yet</h3>
              <Link
                to={`/proposals/new?clientId=${client.id}`}
                className="mt-4 btn-primary inline-flex"
              >
                Create First Proposal
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {client.proposals?.map((proposal: any) => (
                <Link
                  key={proposal.id}
                  to={`/proposals/${proposal.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {proposal.title}
                    </p>
                    <p className="text-xs text-slate-600">
                      {proposal.reference} • {format(new Date(proposal.createdAt), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`badge ${
                        proposal.status === 'ACCEPTED'
                          ? 'badge-green'
                          : proposal.status === 'SENT'
                            ? 'badge-blue'
                            : 'badge-gray'
                      }`}
                    >
                      {proposal.status}
                    </span>
                    <p className="text-sm font-medium text-slate-900 mt-1">
                      £{proposal.total?.toLocaleString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mtditsa' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Making Tax Digital for Income Tax Self Assessment
          </h2>

          {client.mtditsaEligible ? (
            <div className="space-y-6">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Status:</strong> Required by April 2026
                </p>
                <p className="text-sm text-orange-700 mt-1">
                  This client must submit quarterly updates to HMRC using compatible software.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-3">
                  Quarterly Deadlines (2026-27)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { q: 'Q1', period: 'Apr - Jul', filing: '5 Aug 2026' },
                    { q: 'Q2', period: 'Jul - Oct', filing: '5 Nov 2026' },
                    { q: 'Q3', period: 'Oct - Jan', filing: '5 Feb 2027' },
                    { q: 'Q4', period: 'Jan - Apr', filing: '5 May 2027' },
                  ].map((deadline) => (
                    <div key={deadline.q} className="bg-slate-50 p-3 rounded-lg text-center">
                      <p className="font-semibold text-slate-900">{deadline.q}</p>
                      <p className="text-xs text-slate-600">{deadline.period}</p>
                      <p className="text-sm text-primary-600 mt-1">{deadline.filing}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-3">Recommended Services</h3>
                <ul className="space-y-2">
                  <li className="flex items-center text-sm text-slate-700">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    Quarterly bookkeeping & record keeping
                  </li>
                  <li className="flex items-center text-sm text-slate-700">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    MTD-compatible software setup and training
                  </li>
                  <li className="flex items-center text-sm text-slate-700">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    Quarterly submission service
                  </li>
                  <li className="flex items-center text-sm text-slate-700">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    Year-end tax return preparation
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-600">This client is not required to comply with MTD ITSA.</p>
              {client.mtditsaIncome && (
                <p className="text-sm text-slate-400 mt-2">
                  Estimated income: £{client.mtditsaIncome.toLocaleString()}
                </p>
              )}
              {client.companyType &&
                !['SOLE_TRADER', 'PARTNERSHIP'].includes(client.companyType) && (
                  <p className="text-sm text-blue-600 mt-4 bg-blue-50 p-3 rounded-lg max-w-md mx-auto">
                    ℹ️ MTD ITSA only applies to Sole Traders and Partnerships.
                    {client.companyType === 'LIMITED_COMPANY' &&
                      ' Limited companies file Corporation Tax returns instead.'}
                    {client.companyType === 'LLP' && ' LLPs file Corporation Tax returns instead.'}
                    {client.companyType === 'CHARITY' && ' Charities are exempt from MTD ITSA.'}
                    {client.companyType === 'NON_PROFIT' &&
                      ' Non-profit organisations are exempt from MTD ITSA.'}
                  </p>
                )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'lifecycle' && (
        <div className="glass-tile p-6">
          <h3 className="text-lg font-semibold mb-4">Client Lifecycle &amp; Touchpoints</h3>
          <LifecyclePanel client={client} onRefresh={loadClient} />
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Client</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">Client Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Company Type</label>
                  <select
                    value={editForm.companyType}
                    onChange={(e) => setEditForm({ ...editForm, companyType: e.target.value })}
                    className="mt-1 input-field w-full"
                  >
                    <option value="LIMITED_COMPANY">Limited Company</option>
                    <option value="SOLE_TRADER">Sole Trader</option>
                    <option value="PARTNERSHIP">Partnership</option>
                    <option value="LLP">LLP</option>
                    <option value="CHARITY">Charity</option>
                    <option value="NON_PROFIT">Non-Profit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-2">
                  Relationship with your practice
                </label>
                <div className="flex flex-wrap gap-2">
                  {(['NEW', 'EXISTING'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, clientRelationship: value })}
                      className={`text-sm px-3 py-2 rounded-lg border ${
                        editForm.clientRelationship === value
                          ? 'border-primary-500 bg-primary-50 text-primary-800'
                          : 'border-slate-200'
                      }`}
                    >
                      {value === 'NEW' ? 'New client' : 'Existing client'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">Email</label>
                  <input
                    type="email"
                    value={editForm.contactEmail}
                    onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Phone</label>
                  <input
                    type="tel"
                    value={editForm.contactPhone}
                    onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800">
                  Main contact name
                </label>
                <input
                  type="text"
                  value={editForm.contactName}
                  onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                  className="mt-1 input-field w-full"
                  placeholder="e.g. Jane Smith"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Used in proposal cover letters. Falls back to the client name if left blank.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">Company Number</label>
                  <input
                    type="text"
                    value={editForm.companyNumber}
                    onChange={(e) => setEditForm({ ...editForm, companyNumber: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">UTR</label>
                  <input
                    type="text"
                    value={editForm.utr}
                    onChange={(e) => setEditForm({ ...editForm, utr: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">VAT Number</label>
                  <input
                    type="text"
                    value={editForm.vatNumber}
                    onChange={(e) => setEditForm({ ...editForm, vatNumber: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Industry</label>
                  <input
                    type="text"
                    value={editForm.industry}
                    onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">Employees</label>
                  <input
                    type="number"
                    value={editForm.employeeCount}
                    onChange={(e) =>
                      setEditForm({ ...editForm, employeeCount: Number(e.target.value) })
                    }
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Turnover (£)</label>
                  <input
                    type="number"
                    value={editForm.turnover}
                    onChange={(e) => setEditForm({ ...editForm, turnover: Number(e.target.value) })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800">Address Line 1</label>
                <input
                  type="text"
                  value={editForm.addressLine1}
                  onChange={(e) => setEditForm({ ...editForm, addressLine1: e.target.value })}
                  className="mt-1 input-field w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800">Address Line 2</label>
                <input
                  type="text"
                  value={editForm.addressLine2}
                  onChange={(e) => setEditForm({ ...editForm, addressLine2: e.target.value })}
                  className="mt-1 input-field w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">City</label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Postcode</label>
                  <input
                    type="text"
                    value={editForm.postcode}
                    onChange={(e) => setEditForm({ ...editForm, postcode: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
              <button onClick={() => setShowEditModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleUpdateClient}
                disabled={isSaving || !editForm.name || !editForm.contactEmail}
                className="btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoeOnlyModal && client && (
        <LoeOnlyModal
          clientId={client.id}
          clientName={client.name}
          onClose={() => setShowLoeOnlyModal(false)}
        />
      )}
    </div>
  );
};

// --- Lifecycle + Timeline Components ---
const STAGE_COLORS: Record<string, string> = {
  PROSPECT: 'bg-slate-100 text-slate-700',
  PROPOSAL_ACCEPTED: 'bg-emerald-100 text-emerald-700',
  AML_PENDING: 'bg-amber-100 text-amber-700',
  AML_COMPLETE: 'bg-emerald-100 text-emerald-700',
  ENGAGEMENT_LETTER_SENT: 'bg-blue-100 text-blue-700',
  ENGAGEMENT_LETTER_SIGNED: 'bg-blue-100 text-blue-700',
  INFO_REQUESTED: 'bg-orange-100 text-orange-700',
  INFO_RECEIVED: 'bg-emerald-100 text-emerald-700',
  ONBOARDING_SETUP: 'bg-primary-100 text-primary-700',
  KICKOFF_SENT: 'bg-emerald-100 text-emerald-700',
  MILESTONE_CHECK_IN: 'bg-primary-100 text-primary-700',
  SATISFACTION_CHECK: 'bg-pink-100 text-pink-700',
  ONGOING: 'bg-slate-100 text-slate-700',
  ANNUAL_REVIEW: 'bg-primary-100 text-primary-700',
};

function LifecyclePanel({ client, onRefresh }: { client: any; onRefresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const stage = client.lifecycleStage || 'PROSPECT';

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getClientTouchpoints(client.id);
        setUpcoming((res as any).data || []);
      } catch {
        /* touchpoints are optional — ignore */
      }
    })();
  }, [client.id]);

  const handleAction = async (action: string) => {
    setBusy(action);
    try {
      if (action === 'aml') {
        await apiClient.markAmlComplete(client.id);
        toast.success('AML complete — engagement letter queued for approval');
      } else if (action === 'engagement') {
        await apiClient.markEngagementLetterSigned(client.id);
        toast.success('Engagement letter signed — information request sequence started');
      } else if (action === 'info') {
        await apiClient.markInfoReceived(client.id);
        toast.success('Information received — workflow advancing');
      } else if (action === 'deadlines') {
        await apiClient.scheduleDeadlineReminders(client.id);
        toast.success('Deadline reminders queued');
      }
      onRefresh();
    } catch (e) {
      toast.error('Action failed');
    } finally {
      setBusy(null);
    }
  };

  // Beautiful grouped journey for intuitiveness (main phases)
  const journeySteps = [
    { key: 'PROSPECT', label: 'Prospect', stages: ['PROSPECT'] },
    { key: 'PROPOSAL', label: 'Proposal signed', stages: ['PROPOSAL_ACCEPTED'] },
    { key: 'AML', label: 'AML & ID', stages: ['AML_PENDING', 'AML_COMPLETE'] },
    {
      key: 'ENGAGEMENT',
      label: 'Engagement',
      stages: ['ENGAGEMENT_LETTER_SENT', 'ENGAGEMENT_LETTER_SIGNED'],
    },
    { key: 'INFO', label: 'Info Gathering', stages: ['INFO_REQUESTED', 'INFO_RECEIVED'] },
    { key: 'ONBOARD', label: 'Onboard & Kickoff', stages: ['ONBOARDING_SETUP', 'KICKOFF_SENT'] },
    {
      key: 'LIVE',
      label: 'Live & Review',
      stages: ['MILESTONE_CHECK_IN', 'ONGOING', 'SATISFACTION_CHECK', 'ANNUAL_REVIEW'],
    },
  ];

  const currentStepIndex = journeySteps.findIndex((s) =>
    s.stages.some((st) => stage.includes(st.split('_')[0]) || stage === st)
  );

  const guidance: Record<string, string> = {
    PROSPECT: 'No signed proposal yet — send a quotation when you are ready to engage this client.',
    PROPOSAL_ACCEPTED: 'Welcome sent. Next: complete AML verification to unlock engagement letter.',
    AML_PENDING: client.amlSubmittedAt
      ? 'Client submitted AML details — review in client record, then mark complete when verified.'
      : 'AML email sent with secure form link. Chase if needed, then mark complete when verified.',
    AML_COMPLETE: 'Engagement letter is queued — approve and send in Settings → Automation.',
    ENGAGEMENT_LETTER_SENT:
      'Engagement letter sent (PDF attached). Mark signed once the client has returned it.',
    ENGAGEMENT_LETTER_SIGNED:
      'Contract signed. Information requests and reminders will send automatically.',
    INFO_REQUESTED:
      'Chase outstanding info. After 3 automated reminders, you will get a human review flag.',
    INFO_RECEIVED:
      'Onboarding and kick-off emails are scheduled. Client moves to live care after kick-off.',
    ONBOARDING_SETUP: 'Onboarding email sent or pending. Kick-off follows within 24 hours.',
    KICKOFF_SENT: 'Client is live. Schedule milestone reminders from actual due dates.',
    default: 'Automation is running in the background. Check Settings for templates.',
  };

  const currentGuidance = guidance[stage] || guidance.default;

  return (
    <div className="space-y-6">
      {/* Journey header + visual progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-xs uppercase tracking-[1px] text-slate-500">Client Journey</div>
            <div className="text-xl font-semibold flex items-center gap-2">
              {stage.replace(/_/g, ' ')}
              <span
                className={`px-2.5 py-0.5 text-xs rounded-full ${STAGE_COLORS[stage] || 'bg-slate-100 text-slate-600'}`}
              >
                Step {Math.max(1, currentStepIndex + 1)} of {journeySteps.length}
              </span>
            </div>
          </div>
          <div className="hidden sm:flex items-center text-xs text-slate-400">
            <SparklesIcon className="h-4 w-4 mr-1" /> Automated touchpoints active
          </div>
        </div>

        {/* Visual Stepper - beautiful & intuitive */}
        <div className="flex flex-wrap gap-1.5">
          {journeySteps.map((step, idx) => {
            const isActive = idx === currentStepIndex;
            const isPast = idx < currentStepIndex;
            return (
              <motion.div
                key={idx}
                whileHover={{ scale: 1.02 }}
                className={`flex-1 min-w-[92px] rounded-2xl border px-3 py-2 text-center text-xs transition-all cursor-default
                  ${
                    isActive
                      ? 'bg-primary-50 border-primary-300 text-primary-700 shadow-sm dark:bg-primary-950/40 dark:border-primary-800'
                      : isPast
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900'
                        : 'bg-white/60 border-slate-200 text-slate-500 dark:bg-slate-800/60 dark:border-slate-700'
                  }`}
                animate={isActive ? { scale: [1, 1.03, 1] } : {}}
                transition={{ duration: 0.4 }}
              >
                <div className="font-medium flex items-center justify-center gap-1">
                  {isPast && <CheckCircleIcon className="h-3.5 w-3.5" />}
                  {step.label}
                  {isActive && <ArrowRightIcon className="h-3 w-3 ml-0.5" />}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Guidance + Contextual primary actions */}
      <div className="glass-tile p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-primary-500">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
              What happens next
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{currentGuidance}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {stage === 'AML_PENDING' && (
            <button
              onClick={() => handleAction('aml')}
              disabled={!!busy}
              className="btn-primary text-sm px-5 py-2.5"
            >
              {busy === 'aml' ? 'Marking AML complete…' : '✓ Mark AML / ID Complete'}
            </button>
          )}
          {(stage === 'ENGAGEMENT_LETTER_SENT' || stage === 'AML_COMPLETE') && (
            <button
              onClick={() => handleAction('engagement')}
              disabled={!!busy}
              className="btn-primary text-sm px-5 py-2.5"
            >
              {busy === 'engagement' ? 'Updating…' : '✓ Mark Engagement Letter Signed'}
            </button>
          )}
          {stage === 'INFO_REQUESTED' && (
            <button
              onClick={() => handleAction('info')}
              disabled={!!busy}
              className="btn-primary text-sm px-5 py-2.5"
            >
              {busy === 'info' ? 'Updating…' : '✓ Mark Information Received'}
            </button>
          )}
          <button
            onClick={() => handleAction('deadlines')}
            disabled={!!busy}
            className="btn-secondary text-sm px-5 py-2.5"
          >
            {busy === 'deadlines' ? 'Scheduling…' : 'Schedule deadline reminders'}
          </button>
        </div>
      </div>

      {client.amlSubmittedAt && !client.amlCompletedAt && (
        <div className="glass-tile p-4 border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 text-sm text-emerald-800 dark:text-emerald-200">
          Client submitted AML / ID details on{' '}
          {new Date(client.amlSubmittedAt).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          . Review before marking complete.
        </div>
      )}

      <AmlPartnerPanel
        clientId={client.id}
        clientName={client.name}
        amlSubmittedAt={client.amlSubmittedAt}
        amlCompletedAt={client.amlCompletedAt}
        onUpdated={onRefresh}
      />

      {/* Client controls - pause + marketing */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={async () => {
            try {
              await apiClient.updateClient(client.id, {
                touchpointsPaused: !client.touchpointsPaused,
              });
              toast.success(
                client.touchpointsPaused
                  ? 'Automation resumed'
                  : 'Automation paused for this client'
              );
              onRefresh();
            } catch {
              toast.error('Update failed');
            }
          }}
          className="btn-secondary text-sm"
        >
          {client.touchpointsPaused
            ? '▶ Resume automated touchpoints'
            : '⏸ Pause all automated touchpoints'}
        </button>
        <button
          onClick={async () => {
            try {
              await apiClient.updateClient(client.id, {
                marketingConsent: !client.marketingConsent,
              });
              toast.success('Marketing consent updated');
              onRefresh();
            } catch {
              toast.error('Failed');
            }
          }}
          className="btn-secondary text-sm"
        >
          {client.marketingConsent
            ? 'Revoke marketing consent'
            : 'Grant marketing consent (reviews & check-ins)'}
        </button>
      </div>

      {/* Upcoming scheduled touchpoints - makes the automation transparent and actionable */}
      {upcoming.filter((t: any) => t.status === 'PENDING').length > 0 && (
        <div className="glass-tile p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarIcon className="h-4 w-4 text-slate-500" />
            <div className="font-semibold text-sm">Upcoming automated touchpoints</div>
          </div>
          <div className="space-y-2 text-sm">
            {upcoming
              .filter((t: any) => t.status === 'PENDING')
              .slice(0, 4)
              .map((tp: any, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex justify-between items-center rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2 bg-white/50 dark:bg-slate-900/40"
                >
                  <div>
                    <span className="font-medium">{tp.stage?.replace(/_/g, ' ')}</span>
                    {tp.template?.subject && (
                      <span className="text-xs text-slate-500 ml-2">“{tp.template.subject}”</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(tp.scheduledFor).toLocaleDateString('en-GB', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </motion.div>
              ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            These will send automatically unless paused or awaiting your approval.
          </div>
        </div>
      )}

      <ClientTimeline clientId={client.id} />

      <p className="text-xs text-slate-500">
        Manage templates globally in <span className="font-medium">Settings → Automation</span>.
        Touchpoints respect marketing consent and human approval gates.
      </p>
    </div>
  );
}

function ClientTimeline({ clientId }: { clientId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const act = await apiClient.getClientActivity(clientId);
        setLogs((act as any).data || []);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [clientId]);

  if (loading) {
    return <div className="text-sm text-slate-500 py-4">Loading client timeline…</div>;
  }

  const relevant = logs.filter(
    (l: any) =>
      l.action?.startsWith('TOUCHPOINT') ||
      l.action?.includes('AML') ||
      l.action?.includes('LIFECYCLE') ||
      l.action?.includes('INFO')
  );

  if (!relevant.length) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center bg-white/50 dark:bg-slate-900/30">
        <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 dark:bg-primary-900/30">
          <SparklesIcon className="h-6 w-6 text-primary-600" />
        </div>
        <div className="font-medium">Automation is ready</div>
        <p className="mt-1 max-w-xs mx-auto text-sm text-slate-500">
          When this client accepts a proposal, the welcome, AML, and follow-up sequence will start
          automatically. You’ll see every step here.
        </p>
      </div>
    );
  }

  const getActionIcon = (action: string) => {
    if (action.includes('AML')) return <CheckCircleIcon className="h-4 w-4" />;
    if (action.includes('TOUCHPOINT')) return <EnvelopeIcon className="h-4 w-4" />;
    if (action.includes('INFO')) return <DocumentTextIcon className="h-4 w-4" />;
    return <ClockIcon className="h-4 w-4" />;
  };

  // Group by stage (best effort from action/description)
  const groups: Record<string, any[]> = {};
  relevant.forEach((log: any) => {
    let key = 'GENERAL';
    const tpMatch = log.action?.match(/TOUCHPOINT_([A-Z_]+)/);
    if (tpMatch) {
      key = tpMatch[1];
    } else if (log.action?.startsWith('CLIENT_AML')) {
      key = 'AML_COMPLETE';
    } else if (log.action?.includes('AML')) {
      key = 'AML';
    } else if (log.action?.includes('INFO')) {
      key = 'INFO';
    } else if (log.action?.includes('LIFECYCLE')) {
      key = 'LIFECYCLE';
    } else {
      const descMatch = log.description?.match(/([A-Z_]{5,})/);
      key = descMatch ? descMatch[1] : log.action || 'GENERAL';
    }
    if (!groups[key]) groups[key] = [];
    groups[key].push(log);
  });

  const stageOrder = Object.keys(groups).sort();

  return (
    <div>
      <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <ClockIcon className="h-4 w-4" /> Activity Timeline
      </h4>

      <div className="space-y-8">
        {stageOrder.map((stageKey, groupIdx) => {
          const items = groups[stageKey];
          const color = STAGE_COLORS[stageKey] || 'bg-slate-100 text-slate-700';

          return (
            <div key={groupIdx} className="relative pl-6">
              {/* Stage header */}
              <div
                className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full mb-3 ${color}`}
              >
                {stageKey.replace(/_/g, ' ')}
                <span className="opacity-60">({items.length})</span>
              </div>

              {/* Vertical timeline line */}
              <div className="absolute left-[13px] top-8 bottom-0 w-px bg-slate-200" />

              <div className="space-y-4">
                {items.map((log: any, idx: number) => (
                  <div key={idx} className="relative flex gap-3">
                    {/* Dot */}
                    <div className="absolute left-0 mt-1.5 w-3 h-3 rounded-full border-2 border-white bg-primary-500 shadow-sm" />

                    <div className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 font-medium text-sm text-slate-900 dark:text-slate-100">
                          <span className="text-primary-500">{getActionIcon(log.action)}</span>
                          {log.action}
                        </div>
                        <div className="text-[10px] text-slate-400 whitespace-nowrap ml-2 text-right">
                          {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                          <div className="text-[9px] opacity-70">
                            {new Date(log.createdAt).toLocaleDateString('en-GB', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                        </div>
                      </div>

                      {log.description && (
                        <div className="mt-1 text-sm text-slate-600">{log.description}</div>
                      )}

                      {log.user && (
                        <div className="mt-2 text-xs text-slate-500">
                          by {log.user.firstName} {log.user.lastName}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ClientDetail;
