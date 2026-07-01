import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  EnvelopeIcon,
  CheckIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  PrinterIcon,
  DocumentTextIcon,
  ClockIcon,
  CalendarIcon,
  UserIcon,
  BuildingOfficeIcon,
  LinkIcon,
  EyeIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
  CreditCardIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import ProposalAiAssist from '../../components/ai/ProposalAiAssist';
import ProposalEmailPreviewDialog from '../../components/ai/ProposalEmailPreviewDialog';
import { formatCurrency } from '../../utils/formatters';
import { copyTextToClipboard } from '../../utils/clipboard';
import { useAuthStore } from '../../stores/authStore';
import { format, formatDistanceToNow } from 'date-fns';
import { generateTermsAndConditions } from '../../data/defaultTerms';
import { generateDefaultCoverLetter } from '../../data/defaultCoverLetter';
import SignaturePad from '../../components/SignaturePad';
import SkeletonProposalDetail from '../../components/skeleton/SkeletonProposalDetail';

const statusConfig: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  DRAFT: {
    color: 'text-slate-700 dark:text-slate-200',
    bg: 'bg-slate-100 dark:bg-slate-800',
    icon: PencilIcon,
    label: 'Draft',
  },
  SENT: {
    color: 'text-blue-700 dark:text-blue-200',
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    icon: EnvelopeIcon,
    label: 'Sent',
  },
  VIEWED: {
    color: 'text-purple-700 dark:text-purple-200',
    bg: 'bg-purple-100 dark:bg-purple-900/40',
    icon: ClockIcon,
    label: 'Viewed',
  },
  ACCEPTED: {
    color: 'text-green-700 dark:text-green-200',
    bg: 'bg-green-100 dark:bg-green-900/40',
    icon: CheckIcon,
    label: 'Signed',
  },
  DECLINED: {
    color: 'text-red-700 dark:text-red-200',
    bg: 'bg-red-100 dark:bg-red-900/40',
    icon: XMarkIcon,
    label: 'Declined',
  },
  EXPIRED: {
    color: 'text-slate-700 dark:text-slate-200',
    bg: 'bg-slate-100 dark:bg-slate-800',
    icon: ClockIcon,
    label: 'Expired',
  },
};

const frequencyLabels: Record<string, string> = {
  ONE_TIME: 'One-time',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
};

const approvalStatusConfig: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  NONE: { label: 'Not submitted', color: 'text-slate-700', bg: 'bg-slate-100' },
  PENDING: { label: 'Awaiting partner approval', color: 'text-amber-800', bg: 'bg-amber-100' },
  APPROVED: { label: 'Partner approved', color: 'text-emerald-800', bg: 'bg-emerald-100' },
  REJECTED: { label: 'Rejected by partner', color: 'text-red-800', bg: 'bg-red-100' },
};

const APPROVER_ROLES = new Set(['ADMIN', 'PARTNER', 'MANAGER']);
const PARTNER_OVERRIDE_ROLES = new Set(['ADMIN', 'PARTNER']);
const SUBMITTER_ROLES = new Set(['JUNIOR', 'SENIOR']);

const paymentStatusConfig: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  NOT_STARTED: { label: 'Not started', color: 'text-slate-700', bg: 'bg-slate-100' },
  PENDING: { label: 'Pending setup', color: 'text-amber-800', bg: 'bg-amber-100' },
  ACTIVE: { label: 'Mandate active', color: 'text-emerald-800', bg: 'bg-emerald-100' },
  PAID: { label: 'Paid', color: 'text-emerald-800', bg: 'bg-emerald-100' },
  FAILED: { label: 'Failed', color: 'text-red-800', bg: 'bg-red-100' },
  CANCELLED: { label: 'Cancelled', color: 'text-slate-700', bg: 'bg-slate-100' },
  SKIPPED: { label: 'Skipped by client', color: 'text-slate-600', bg: 'bg-slate-100' },
};

type ProposalDetailTab = 'overview' | 'audit';

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

const ProposalDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: ProposalDetailTab = searchParams.get('tab') === 'audit' ? 'audit' : 'overview';

  const setActiveTab = (tab: ProposalDetailTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'audit') next.set('tab', 'audit');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };
  const { tenant, user } = useAuthStore();
  const [proposal, setProposal] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryPosition, setSignatoryPosition] = useState('');
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [copyingLink, setCopyingLink] = useState(false);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [copyingPortalLink, setCopyingPortalLink] = useState(false);
  const [coverLetterDraft, setCoverLetterDraft] = useState('');
  const [editingCoverLetter, setEditingCoverLetter] = useState(false);
  const [savingCoverLetter, setSavingCoverLetter] = useState(false);
  const [showSendEmailPreview, setShowSendEmailPreview] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);

  // Rich compliance history (views + signatures + sent events) from dedicated audit trail
  const [auditTrail, setAuditTrail] = useState<any[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    if (id) {
      loadProposal();
      loadCompanySettings();
      loadAuditTrail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (proposal && !editingCoverLetter) {
      setCoverLetterDraft(proposal.coverLetter || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync draft when proposal id/cover letter changes
  }, [proposal?.id, proposal?.coverLetter, editingCoverLetter]);

  const loadCompanySettings = async () => {
    try {
      const response = (await apiClient.getTenantSettings()) as any;
      if (response.success) {
        setCompanySettings(response.data);
      }
    } catch (error) {
      // Error handled by UI
    }
  };

  const handleSignature = async (signature: string) => {
    setSignatureData(signature);
    const deviceInfo = JSON.stringify({
      platform: navigator.platform,
      screen: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
    });
    try {
      await apiClient.acceptProposal(id!, {
        signature,
        acceptedBy: signatoryName,
        signatoryPosition,
        deviceInfo,
        acceptedAt: new Date().toISOString(),
      });
      toast.success('Proposal accepted with electronic signature');
      setShowSignaturePad(false);
      loadProposal();
    } catch (error) {
      toast.error('Failed to submit signature');
    }
  };

  const generateFullTerms = () => {
    if (!companySettings) return proposal?.terms || '';

    const companyDetails = {
      name: companySettings.branding?.name || tenant?.name || '[Company Name]',
      companyNumber: companySettings.companyRegistration || '[Company Number]',
      address: companySettings.address?.line1
        ? `${companySettings.address.line1}, ${companySettings.address.city}, ${companySettings.address.postcode}`
        : '[Registered Office Address]',
      professionalBody: companySettings.professionalBody || '[Professional Body]',
      insurerName: companySettings.insurerName || '[Insurer Name]',
      governingLaw: companySettings.governingLaw || 'England and Wales',
      fcaAuthorised: companySettings.fcaAuthorised || false,
    };

    return generateTermsAndConditions(companyDetails);
  };

  const handlePrint = async () => {
    if (!id) return;
    try {
      toast.loading('Preparing PDF for print…');
      const blob = await apiClient.downloadProposalPDF(id);
      toast.dismiss();
      if (!blob || blob.size === 0) {
        toast.error('Could not generate PDF for printing');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.focus();
          printWindow.print();
        });
        toast.success('PDF opened — use your browser print dialog');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `proposal-${proposal?.reference || id}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success('PDF downloaded — open it to print');
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.dismiss();
      toast.error('Could not prepare PDF for printing');
    }
  };

  const loadProposal = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.getProposal(id!)) as any;
      setProposal(response.data);
      // Keep the rich access history in sync
      loadAuditTrail();
    } catch (error) {
      // Error handled by UI
    } finally {
      setIsLoading(false);
    }
  };

  const loadAuditTrail = async () => {
    if (!id) return;
    try {
      setLoadingAudit(true);
      const res = (await apiClient.getProposalAuditTrail(id)) as any;
      if (res?.success) {
        setAuditTrail(res.data || []);
      }
    } catch (e) {
      // non-fatal; the inline signatures + client activity still work
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleSend = async (approved?: {
    subject: string;
    textBody: string;
    htmlBody?: string;
  }) => {
    try {
      toast.loading('Sending proposal…');
      await apiClient.sendProposal(id!, approved);
      toast.dismiss();
      toast.success('Proposal sent successfully');
      loadProposal();
      loadAuditTrail();
    } catch (error: any) {
      toast.dismiss();
      const message =
        error?.response?.data?.error?.message ||
        error?.response?.data?.message ||
        error?.message;
      if (message?.toLowerCase().includes('email')) {
        toast.error(
          message.includes('transport') || message.includes('configured')
            ? 'Email is not configured on the server — contact your administrator'
            : message
        );
      }
    }
  };

  const openSendFlow = () => {
    setShowSendEmailPreview(true);
  };

  const handleSubmitForApproval = async () => {
    if (!id) return;
    try {
      setApprovalActionLoading(true);
      await apiClient.submitProposalForApproval(id);
      toast.success('Submitted for partner approval');
      loadProposal();
      loadAuditTrail();
    } catch {
      // handled by API interceptor
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const handleApproveProposal = async () => {
    if (!id) return;
    try {
      setApprovalActionLoading(true);
      await apiClient.approveProposal(id);
      toast.success('Proposal approved');
      loadProposal();
      loadAuditTrail();
    } catch {
      // handled by API interceptor
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const handleRejectProposal = async () => {
    if (!id || !rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    try {
      setApprovalActionLoading(true);
      await apiClient.rejectProposal(id, { rejectionReason: rejectionReason.trim() });
      toast.success('Proposal rejected');
      setShowRejectModal(false);
      setRejectionReason('');
      loadProposal();
      loadAuditTrail();
    } catch {
      // handled by API interceptor
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const downloadSignatureCertificate = async (signatureId: string) => {
    if (!id || !proposal) return;
    try {
      const blob = await apiClient.downloadSignatureCertificate(id, signatureId);
      if (!blob || blob.size === 0) {
        toast.error('Could not download certificate (empty file).');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signature-certificate-${proposal.reference}-${signatureId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 5000);
      toast.success('Certificate PDF download started');
    } catch {
      toast.error('Could not download signature certificate.');
    }
  };

  const downloadSignatureAuditJson = async (signatureId: string) => {
    if (!id || !proposal) return;
    try {
      const response = (await apiClient.getSignatureAudit(id, signatureId)) as any;
      if (!response?.success || !response?.data) {
        toast.error('Could not download audit record.');
        return;
      }
      const json = JSON.stringify(response.data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signature-audit-${proposal.reference}-${signatureId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => window.URL.revokeObjectURL(url), 5000);
      toast.success('Audit JSON download started');
    } catch {
      toast.error('Could not download audit record.');
    }
  };

  const downloadPDF = async () => {
    try {
      const blob = await apiClient.downloadProposalPDF(id!);
      if (!blob || blob.size === 0) {
        toast.error('Could not download PDF (empty file). Please try again.');
        return;
      }
      if (
        blob.type &&
        (blob.type.includes('json') ||
          blob.type.startsWith('text/') ||
          blob.type === 'application/problem+json')
      ) {
        toast.error('Could not download PDF. Please sign in again or try later.');
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proposal-${proposal.reference}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Delay revoke to give the browser time to start the download
      setTimeout(() => window.URL.revokeObjectURL(url), 5000);
      toast.success('PDF download started');
    } catch (err: any) {
      console.error('PDF download error:', err);
      toast.error('Could not download PDF.');
    }
  };

  const handleCopyClientLink = async () => {
    if (!id || !proposal) return;
    try {
      if (proposal.shareToken) {
        const link = `${window.location.origin}/proposals/view/${proposal.shareToken}`;
        const ok = await copyTextToClipboard(link);
        if (ok) {
          toast.success('Client link copied to clipboard');
        } else {
          toast.error('Could not copy automatically. Copy this link manually: ' + link, {
            duration: 8000,
          });
        }
        return;
      }
      setCopyingLink(true);
      const response = (await apiClient.post(`/proposals/${id}/share`, {
        expiryDays: 30,
      })) as any;
      if (response.success && response.data?.shareUrl) {
        const ok = await copyTextToClipboard(response.data.shareUrl);
        if (ok) {
          toast.success('Client link copied to clipboard');
        } else {
          toast.error(
            'Link created but not copied. Copy manually: ' + response.data.shareUrl,
            { duration: 10000 }
          );
        }
        loadProposal();
      } else {
        toast.error('Failed to generate share link');
      }
    } catch {
      toast.error('Failed to copy client link');
    } finally {
      setCopyingLink(false);
    }
  };

  const handleCopyPortalLink = async () => {
    if (!proposal?.clientId) return;
    try {
      setCopyingPortalLink(true);

      const response = (await apiClient.post(`/proposals/portal/${proposal.clientId}`, {
        expiryDays: 90,
        frontendOrigin: window.location.origin,
      })) as any;

      if (!response.success || !response.data?.portalUrl) {
        toast.error('Failed to generate portal link');
        return;
      }

      const portalUrl = response.data.portalUrl;
      setPortalLink(portalUrl);

      const ok = await copyTextToClipboard(portalUrl);
      if (ok) {
        toast.success('Client portal link copied (valid 90 days)');
      } else {
        toast.error('Copy manually: ' + portalUrl, { duration: 10000 });
      }
    } catch (err: any) {
      console.error('[Portal Link] Error:', err);
      toast.error(err?.message || 'Failed to generate portal link');
    } finally {
      setCopyingPortalLink(false);
    }
  };

  const handleSaveCoverLetter = async () => {
    if (!id) return;
    try {
      setSavingCoverLetter(true);
      const res = (await apiClient.updateProposal(id, { coverLetter: coverLetterDraft })) as any;
      if (res?.success === false) {
        toast.error(res?.error?.message || 'Could not save cover letter');
        return;
      }
      toast.success('Cover letter saved');
      setEditingCoverLetter(false);
      loadProposal();
    } catch {
      toast.error('Could not save cover letter');
    } finally {
      setSavingCoverLetter(false);
    }
  };

  const handleInsertDefaultCoverLetter = () => {
    if (!proposal) return;
    setCoverLetterDraft(
      generateDefaultCoverLetter({
        addresseeName: (proposal.client?.contactName?.trim() || proposal.client?.name || 'Client').trim(),
        practiceName: tenant?.name || 'Our practice',
        clientBusinessName: proposal.client?.name || undefined,
      })
    );
  };

  // Group services by billing frequency
  const groupedServices = useMemo(() => {
    if (!proposal?.services) return {};

    return proposal.services.reduce((acc: any, service: any) => {
      const freq = service.billingFrequency || service.frequency || 'MONTHLY';
      if (!acc[freq]) acc[freq] = [];
      acc[freq].push(service);
      return acc;
    }, {});
  }, [proposal]);

  // Calculate totals per frequency group
  const groupTotals = useMemo(() => {
    if (!proposal?.services) return {};

    return Object.entries(groupedServices).reduce((acc: any, [freq, services]: [string, any]) => {
      acc[freq] = {
        subtotal: services.reduce((sum: number, s: any) => sum + (s.lineTotal || s.total || 0), 0),
        vatAmount: services.reduce((sum: number, s: any) => sum + (s.vatAmount || 0), 0),
        total: services.reduce((sum: number, s: any) => sum + (s.grossTotal || s.total || 0), 0),
      };
      return acc;
    }, {});
  }, [groupedServices, proposal]);

  // Calculate monthly equivalent and one-off totals cleanly
  const pricingBreakdown = useMemo(() => {
    if (!proposal?.services) {
      return { monthlyExVat: 0, monthlyVat: 0, monthlyIncVat: 0, oneOffExVat: 0, oneOffVat: 0, oneOffIncVat: 0 };
    }

    return proposal.services.reduce(
      (acc: any, s: any) => {
        const freq = s.billingFrequency || s.frequency || 'MONTHLY';
        const lineTotal = s.lineTotal || s.total || 0; // ex VAT
        const vatAmt = s.vatAmount || 0;
        const gross = s.grossTotal || lineTotal + vatAmt;

        if (freq === 'ONE_TIME') {
          acc.oneOffExVat += lineTotal;
          acc.oneOffVat += vatAmt;
          acc.oneOffIncVat += gross;
        } else {
          // Convert to monthly equivalent
          let monthlyFactor = 1;
          if (freq === 'WEEKLY') monthlyFactor = 52 / 12;
          else if (freq === 'QUARTERLY') monthlyFactor = 1 / 3;
          else if (freq === 'ANNUALLY') monthlyFactor = 1 / 12;

          acc.monthlyExVat += lineTotal * monthlyFactor;
          acc.monthlyVat += vatAmt * monthlyFactor;
          acc.monthlyIncVat += gross * monthlyFactor;
        }
        return acc;
      },
      { monthlyExVat: 0, monthlyVat: 0, monthlyIncVat: 0, oneOffExVat: 0, oneOffVat: 0, oneOffIncVat: 0 }
    );
  }, [proposal]);

  // Check if any service has different VAT rate than default
  const hasMixedVatRates = useMemo(() => {
    if (!proposal?.services) return false;
    const defaultVat = proposal.vatRate || 20;
    return proposal.services.some((s: any) => (s.vatRate || 20) !== defaultVat);
  }, [proposal]);

  if (isLoading) {
    return <SkeletonProposalDetail />;
  }

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="glass-tile p-12 text-center max-w-md">
          <DocumentTextIcon className="mx-auto h-16 w-16 text-slate-300 dark:text-slate-600 mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Proposal not found
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            The proposal you're looking for doesn't exist or you don't have access.
          </p>
          <Link to="/proposals" className="btn-primary inline-flex">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to proposals
          </Link>
        </div>
      </div>
    );
  }

  const status = statusConfig[proposal.status] || statusConfig.DRAFT;
  const StatusIcon = status.icon;
  const approvalStatus = proposal.approvalStatus || 'NONE';
  const approvalStatusUi =
    approvalStatusConfig[approvalStatus] || approvalStatusConfig.NONE;
  const userRole = user?.role;
  const isApprover = userRole ? APPROVER_ROLES.has(userRole) : false;
  const canOverrideApproval = userRole ? PARTNER_OVERRIDE_ROLES.has(userRole) : false;
  const canSubmitForApproval =
    proposal.status === 'DRAFT' &&
    ['NONE', 'REJECTED'].includes(approvalStatus) &&
    (userRole ? SUBMITTER_ROLES.has(userRole) || isApprover : false);
  const canSendDraft =
    proposal.status === 'DRAFT' && (canOverrideApproval || approvalStatus === 'APPROVED');
  const showClientLinkButton = !['DECLINED', 'EXPIRED'].includes(proposal.status);
  const clientOpenCount = typeof proposal.viewCount === 'number' ? proposal.viewCount : 0;
  /** Backend rejects updates once the proposal is signed (ACCEPTED). */
  const canEditCoverLetter = proposal.status !== 'ACCEPTED';

  const viewEvents = auditTrail.filter((e) => (e.action || '').toUpperCase().includes('VIEW'));
  const firstViewedAt =
    viewEvents.length > 0
      ? new Date(viewEvents[0].timestamp)
      : proposal.viewedAt
        ? new Date(proposal.viewedAt)
        : null;
  const lastViewedAt =
    viewEvents.length > 0
      ? new Date(viewEvents[viewEvents.length - 1].timestamp)
      : proposal.lastViewedAt
        ? new Date(proposal.lastViewedAt)
        : proposal.viewedAt
          ? new Date(proposal.viewedAt)
          : null;
  const signedAt = proposal.acceptedAt ? new Date(proposal.acceptedAt) : null;
  const auditEventCount = auditTrail.length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Link
        to="/proposals"
        className="inline-flex items-center text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to proposals
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{proposal.title}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}
            >
              <StatusIcon className="h-3 w-3 mr-1" />
              {status.label}
            </span>
            {proposal.status === 'DRAFT' && approvalStatus !== 'NONE' && (
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${approvalStatusUi.bg} ${approvalStatusUi.color}`}
              >
                <ShieldCheckIcon className="h-3 w-3 mr-1" />
                {approvalStatusUi.label}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {proposal.reference} • Created {format(new Date(proposal.createdAt), 'dd MMM yyyy')}
          </p>
          {approvalStatus === 'PENDING' && proposal.submittedForApprovalAt && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Submitted {formatDistanceToNow(new Date(proposal.submittedForApprovalAt), { addSuffix: true })}
              {proposal.createdBy
                ? ` by ${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`
                : ''}
            </p>
          )}
          {approvalStatus === 'REJECTED' && proposal.rejectionReason && (
            <p className="mt-1 text-xs text-red-700 dark:text-red-300">
              Rejection reason: {proposal.rejectionReason}
            </p>
          )}
          {approvalStatus === 'APPROVED' && proposal.approvedBy && (
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
              Approved by {proposal.approvedBy.firstName} {proposal.approvedBy.lastName}
              {proposal.approvedAt
                ? ` on ${format(new Date(proposal.approvedAt), 'dd MMM yyyy')}`
                : ''}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={downloadPDF} className="btn-secondary" title="Download PDF">
            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
            PDF
          </button>

          {showClientLinkButton && (
            <button
              type="button"
              onClick={handleCopyClientLink}
              disabled={copyingLink}
              className="btn-secondary"
              title="Copy a link your client can open (counts opens when they use it)"
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              {copyingLink ? 'Creating…' : 'Copy client link'}
            </button>
          )}

          {proposal.clientId && (
            <button
              type="button"
              onClick={handleCopyPortalLink}
              disabled={copyingPortalLink}
              className="btn-secondary"
              title="Copy client portal link — shows all their proposals"
            >
              <BuildingOfficeIcon className="h-4 w-4 mr-2" />
              {copyingPortalLink ? 'Creating…' : 'Copy portal link'}
            </button>
          )}

          {canSubmitForApproval && (
            <button
              type="button"
              onClick={handleSubmitForApproval}
              disabled={approvalActionLoading}
              className="btn-secondary"
            >
              <ShieldCheckIcon className="h-4 w-4 mr-2" />
              Submit for partner approval
            </button>
          )}

          {proposal.status === 'DRAFT' && approvalStatus === 'PENDING' && isApprover && (
            <>
              <button
                type="button"
                onClick={handleApproveProposal}
                disabled={approvalActionLoading}
                className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckIcon className="h-4 w-4 mr-2" />
                Approve
              </button>
              <button
                type="button"
                onClick={() => setShowRejectModal(true)}
                disabled={approvalActionLoading}
                className="btn-secondary text-red-700 border-red-200 hover:bg-red-50"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Reject
              </button>
            </>
          )}

          {canSendDraft && (
            <button
              onClick={openSendFlow}
              className="btn-primary"
              style={{ backgroundColor: tenant?.primaryColor || '#0ea5e9' }}
            >
              <EnvelopeIcon className="h-4 w-4 mr-2" />
              Send
            </button>
          )}

          {(proposal.status === 'SENT' || proposal.status === 'VIEWED') && (
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById('electronic-signature-section')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                toast(
                  'A forensic audit trail requires an electronic signature. Use the signature pad below.',
                  { icon: '✍️', duration: 5000 }
                );
              }}
              className="btn-primary bg-green-600 hover:bg-green-700"
            >
              <CheckIcon className="h-4 w-4 mr-2" />
              Accept with signature
            </button>
          )}
        </div>
      </div>

      {/* Payment collection status (post-sign mandate) */}
      {proposal.status === 'ACCEPTED' && (
        <div
          data-testid="payment-collection-status"
          className="glass-tile p-5 print:hidden"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-sky-100 dark:bg-sky-900/40 p-2">
                <CreditCardIcon className="h-5 w-5 text-sky-600 dark:text-sky-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Payment collection
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Direct Debit / card mandate status after sign
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                paymentStatusConfig[proposal.paymentStatus || 'NOT_STARTED']?.bg || 'bg-slate-100'
              } ${
                paymentStatusConfig[proposal.paymentStatus || 'NOT_STARTED']?.color ||
                'text-slate-700'
              }`}
            >
              {paymentStatusConfig[proposal.paymentStatus || 'NOT_STARTED']?.label ||
                'Not started'}
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            {proposal.paymentProvider && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Provider</dt>
                <dd className="font-medium text-slate-900 dark:text-white capitalize">
                  {proposal.paymentProvider === 'gocardless_stub'
                    ? 'GoCardless (demo)'
                    : proposal.paymentProvider}
                </dd>
              </div>
            )}
            {proposal.paymentMandateId && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Mandate ID</dt>
                <dd className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate">
                  {proposal.paymentMandateId}
                </dd>
              </div>
            )}
            {proposal.paymentMethod && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Method</dt>
                <dd className="font-medium text-slate-900 dark:text-white capitalize">
                  {String(proposal.paymentMethod).replace(/_/g, ' ')}
                </dd>
              </div>
            )}
            {proposal.paidAt && (
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Activated</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {format(new Date(proposal.paidAt), 'dd MMM yyyy, HH:mm')}
                </dd>
              </div>
            )}
          </dl>

          {proposal.paymentStatus === 'PENDING' && proposal.paymentUrl && (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <BanknotesIcon className="h-4 w-4" />
              Awaiting client to complete payment setup via the public proposal link.
            </p>
          )}

          {!proposal.paymentStatus && proposal.total > 0 && (
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              No mandate yet. Enable &quot;Collect payment at sign&quot; in Settings → Billing to
              prompt clients after acceptance.
            </p>
          )}
        </div>
      )}

      {/* Client engagement at a glance */}
      {proposal.status !== 'DRAFT' && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {clientOpenCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-800 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-200">
              <EyeIcon className="h-3.5 w-3.5" />
              Opened {clientOpenCount} {clientOpenCount === 1 ? 'time' : 'times'}
            </span>
          )}
          {firstViewedAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              <ClockIcon className="h-3.5 w-3.5 text-slate-400" />
              First opened {format(firstViewedAt, 'dd MMM yyyy, HH:mm')}
            </span>
          )}
          {lastViewedAt && clientOpenCount !== 1 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
              <EyeIcon className="h-3.5 w-3.5 text-slate-400" />
              Last opened {formatDistanceToNow(lastViewedAt, { addSuffix: true })}
            </span>
          )}
          {signedAt && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              <PencilSquareIcon className="h-3.5 w-3.5" />
              Signed {format(signedAt, 'dd MMM yyyy, HH:mm')}
            </span>
          )}
          {proposal.status === 'SENT' && clientOpenCount === 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Awaiting client to open the link
            </span>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700 print:hidden">
        <nav className="flex gap-1" aria-label="Proposal sections">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-primary-500 text-primary-700 dark:text-primary-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Proposal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-primary-500 text-primary-700 dark:text-primary-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheckIcon className="h-4 w-4" />
            Access &amp; Signature
            {auditEventCount > 0 && (
              <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
                {auditEventCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'overview' && (
            <>
          {/* Client info */}
          <div className="glass-tile p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Client</h2>
            <div className="flex items-center">
              <div className="p-3 bg-white/50 dark:bg-slate-800/70 rounded-lg border border-white/10 dark:border-slate-600/40">
                <BuildingOfficeIcon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
              </div>
              <div className="ml-4">
                <p className="font-medium text-slate-900 dark:text-slate-100">{proposal.client?.name}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{proposal.client?.contactEmail}</p>
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
                    className="flex items-start justify-between p-4 bg-white/40 dark:bg-slate-800/70 rounded-lg border border-white/20 dark:border-slate-600/50"
                  >
                    <div className="flex-1">
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
                    <div className="text-right ml-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(service.lineTotal || service.total || 0)}
                        <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                          ex VAT
                        </span>
                      </p>
                      {(service.vatAmount > 0 || hasMixedVatRates) && (
                        <p className="text-xs text-slate-500 dark:text-slate-300">
                          + {formatCurrency(service.vatAmount || 0)} VAT
                        </p>
                      )}
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
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
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cover letter</h2>
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
                    addresseeName: (proposal.client?.contactName?.trim() || proposal.client?.name || 'Client').trim(),
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
                    By signing below, you confirm acceptance of the Terms & Conditions and the
                    services outlined in this proposal.
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
                  <SignaturePad
                    onSignature={handleSignature}
                    onClear={() => setSignatureData(null)}
                  />
                  <button
                    onClick={() => setShowSignaturePad(false)}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {proposal.status === 'ACCEPTED' && activeTab === 'overview' && (
            <div className="glass-tile p-4 border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-200">
                  <CheckIcon className="h-5 w-5" />
                  <span>
                    Signed by <strong>{proposal.acceptedBy}</strong>
                    {signedAt && <> on {format(signedAt, 'dd MMM yyyy, HH:mm')}</>}
                  </span>
                </div>
                <button type="button" onClick={() => setActiveTab('audit')} className="btn-secondary text-xs">
                  View signature &amp; access history
                </button>
              </div>
            </div>
          )}

          {proposal.notes && (
            <div className="glass-tile p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Notes</h2>
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{proposal.notes}</p>
            </div>
          )}
            </>
          )}

          {activeTab === 'audit' && (
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
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Access &amp; Signature History</h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Chronological record of client access via the secure link and electronic signing events. Use for compliance and audit.
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
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No client access recorded yet.</p>
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
                    const who = entry.details?.signedByRole || entry.actor || entry.details?.signedBy || 'Client';
                    label = `Electronically signed by ${who}`;
                    highlight = 'text-emerald-700 dark:text-emerald-300';
                  } else if (isSent) {
                    icon = <EnvelopeIcon className="h-4 w-4 text-blue-600" />;
                    label = 'Proposal sent to client';
                    highlight = 'text-blue-700 dark:text-blue-300';
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
                              <span>{Math.round(entry.details.viewDuration / 1000 / 60)} min viewed</span>
                            </>
                          )}
                        </div>

                        {/* Extra forensic / useful details */}
                        {isSigned && (
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                            {entry.details?.signedByRole && <div>Role: {entry.details.signedByRole}</div>}
                            {entry.details?.agreementAccepted && <div>Terms accepted: Yes</div>}
                            {entry.details?.documentHash && (
                              <div className="font-mono text-[10px] break-all opacity-70">
                                Doc hash: {String(entry.details.documentHash).slice(0, 20)}…
                              </div>
                            )}
                          </div>
                        )}

                        {isView && entry.details?.completed && (
                          <div className="text-[10px] text-emerald-600 mt-0.5">Marked complete by client</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-3 text-[10px] text-slate-400 leading-snug">
              This trail is generated from secure link access logs and signature records. It is intended for your compliance files.
            </p>
          </div>
            </>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {activeTab === 'overview' && id && (
            <ProposalAiAssist proposal={proposal} onUpdated={loadProposal} />
          )}

          {/* Pricing — monthly, annual, and one-time */}
          <div className="glass-tile p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Investment summary
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              Fees grouped by how often they are billed. One-time project fees are separate from
              recurring retainers.
            </p>
            <div className="space-y-3">
              {groupTotals.MONTHLY?.total > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-600 dark:text-slate-300">Monthly</span>
                  <span className="font-bold text-xl text-primary-600 tabular-nums">
                    {formatCurrency(groupTotals.MONTHLY.total)}
                    <span className="text-xs font-normal text-slate-500 ml-1">/month</span>
                  </span>
                </div>
              )}
              {groupTotals.ANNUALLY?.total > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-600 dark:text-slate-300">Annual</span>
                  <span className="font-bold text-xl text-primary-600 tabular-nums">
                    {formatCurrency(groupTotals.ANNUALLY.total)}
                    <span className="text-xs font-normal text-slate-500 ml-1">/year</span>
                  </span>
                </div>
              )}
              {groupTotals.ONE_TIME?.total > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-600 dark:text-slate-300">One-time</span>
                  <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(groupTotals.ONE_TIME.total)}
                  </span>
                </div>
              )}

              {(pricingBreakdown.monthlyIncVat > 0 || pricingBreakdown.oneOffIncVat > 0) && (
              <div className="border-t border-white/20 dark:border-slate-600/50 pt-3 space-y-2">
                {pricingBreakdown.monthlyIncVat > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">Recurring subtotal (ex VAT)</span>
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(pricingBreakdown.monthlyExVat)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">
                        Recurring VAT {hasMixedVatRates ? '(mixed)' : `(${proposal.vatRate || 20}%)`}
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(pricingBreakdown.monthlyVat)}
                      </span>
                    </div>
                  </>
                )}

                {pricingBreakdown.oneOffIncVat > 0 && (
                  <>
                    <div className="flex justify-between text-sm pt-1 border-t border-dashed border-white/10 dark:border-slate-600/30">
                      <span className="text-slate-600 dark:text-slate-300">One-time subtotal (ex VAT)</span>
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(pricingBreakdown.oneOffExVat)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-300">One-time VAT</span>
                      <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(pricingBreakdown.oneOffVat)}
                      </span>
                    </div>
                  </>
                )}

                {proposal.discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">Discount</span>
                    <span className="font-medium text-red-600 dark:text-red-400 tabular-nums">
                      -{formatCurrency(proposal.discountAmount)}
                    </span>
                  </div>
                )}

                {pricingBreakdown.oneOffIncVat > 0 && pricingBreakdown.monthlyIncVat > 0 && (
                  <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-white/30 dark:border-slate-500/50">
                    <span className="font-semibold text-slate-900 dark:text-white">First payment</span>
                    <span className="font-bold text-xl text-slate-900 dark:text-white tabular-nums tracking-tight">
                      {formatCurrency(pricingBreakdown.monthlyIncVat + pricingBreakdown.oneOffIncVat)}
                    </span>
                  </div>
                )}

                {pricingBreakdown.monthlyIncVat > 0 && (
                  <div className="flex justify-between items-baseline pt-2 border-t border-white/10 dark:border-slate-600/30">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Typical monthly cash flow
                    </span>
                    <span className="font-bold text-2xl text-slate-900 dark:text-white tabular-nums tracking-tight">
                      {formatCurrency(pricingBreakdown.monthlyIncVat)}
                    </span>
                  </div>
                )}
              </div>
              )}

              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                {pricingBreakdown.oneOffIncVat > 0 && pricingBreakdown.monthlyIncVat > 0
                  ? 'First payment includes one-time fees plus your first month of recurring services.'
                  : pricingBreakdown.oneOffIncVat > 0
                    ? 'One-time fees are payable as agreed in your engagement letter.'
                    : 'Monthly figure averages recurring fees across the year where annual or quarterly lines apply.'}
              </p>
            </div>
          </div>

          {/* Valid until */}
          <div className="glass-tile p-6">
            <div className="flex items-center gap-2 mb-2">
              <CalendarIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Valid Until</h2>
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              {format(new Date(proposal.validUntil), 'dd MMMM yyyy')}
            </p>
            {new Date(proposal.validUntil) < new Date() && proposal.status !== 'ACCEPTED' && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">Expired</p>
            )}
          </div>

          {/* Payment terms */}
          <div className="glass-tile p-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Payment Terms
            </h2>
            <p className="text-slate-700 dark:text-slate-300">{proposal.paymentTerms}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Frequency: {proposal.paymentFrequency?.toLowerCase()}
            </p>
          </div>

          {/* Created by */}
          <div className="glass-tile p-6">
            <div className="flex items-center gap-2 mb-2">
              <UserIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Created By</h2>
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              {proposal.createdBy?.firstName} {proposal.createdBy?.lastName}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{proposal.createdBy?.email}</p>
          </div>

          {proposal.activityLogs?.length > 0 && (
            <div className="glass-tile p-6">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
                Activity timeline
              </h2>
              <ul className="space-y-3 max-h-64 overflow-y-auto">
                {proposal.activityLogs.map((log: any) => (
                  <li key={log.id} className="text-sm border-l-2 border-primary-500/40 pl-3">
                    <p className="text-slate-800 dark:text-slate-200">{log.description || log.action}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {format(new Date(log.createdAt), 'dd MMM yyyy, HH:mm')}
                      {log.user
                        ? ` · ${log.user.firstName || ''} ${log.user.lastName || ''}`.trim()
                        : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Client opens (public link only) — quick glance; full history below */}
          {proposal.status !== 'DRAFT' && (
            <div className="glass-tile p-6">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Client activity
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Client opened the shared proposal{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">{clientOpenCount}</span>{' '}
                {clientOpenCount === 1 ? 'time' : 'times'}
                {proposal.lastViewedAt && (
                  <>
                    . Last:{' '}
                    <span className="text-slate-800 dark:text-slate-200">
                      {format(new Date(proposal.lastViewedAt), 'dd MMM yyyy, HH:mm')}
                    </span>
                  </>
                )}
                .
              </p>
              <p className="text-[10px] text-primary-600 dark:text-primary-400 mt-2">
                <button type="button" onClick={() => setActiveTab('audit')} className="hover:underline">
                  Open Access &amp; Signature History
                </button>{' '}
                for IP addresses, timestamps, and signature forensics.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2 leading-relaxed">
                Counts update only via the public client link. Internal views do not count.
              </p>
            </div>
          )}
        </div>
      </div>

      <ProposalEmailPreviewDialog
        open={showSendEmailPreview}
        onClose={() => setShowSendEmailPreview(false)}
        proposalId={id}
        onSend={handleSend}
      />

      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Reject proposal
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Provide a reason so the drafter knows what to revise before resubmitting.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="input-field w-full mt-4 min-h-[120px]"
              placeholder="Rejection reason (required)"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectProposal}
                disabled={approvalActionLoading || !rejectionReason.trim()}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                Reject proposal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProposalDetail;
