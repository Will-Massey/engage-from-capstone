/**
 * ProposalDetailProvider — owns every piece of proposal-detail state, all effects,
 * handlers, derived values, and the loading / not-found early returns. Extracted
 * verbatim from the ProposalDetail monolith; the context value is a plain object
 * literal recreated each render, preserving the monolith's re-render semantics.
 */

import {
  useEffect,
  useState,
  useMemo,
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  EnvelopeIcon,
  CheckIcon,
  XMarkIcon,
  DocumentTextIcon,
  ClockIcon,
  NoSymbolIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../../utils/api';
import { appPath } from '../../../utils/appBase';
import toast from 'react-hot-toast';
import { copyTextToClipboard } from '../../../utils/clipboard';
import { useAuthStore, type Tenant } from '../../../stores/authStore';
import { generateTermsAndConditions } from '../../../data/defaultTerms';
import { generateDefaultCoverLetter } from '../../../data/defaultCoverLetter';
import SkeletonProposalDetail from '../../../components/skeleton/SkeletonProposalDetail';
import { type DeclineReason } from '../../../constants/declineReasons';
import { monthlyEquivalentFor } from '@shared/pricingEngine';

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
  WITHDRAWN: {
    color: 'text-amber-800 dark:text-amber-200',
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    icon: NoSymbolIcon,
    label: 'Rescinded',
  },
  ARCHIVED: {
    color: 'text-slate-600 dark:text-slate-300',
    bg: 'bg-slate-100 dark:bg-slate-800',
    icon: ArchiveBoxIcon,
    label: 'Archived',
  },
  LOST: {
    color: 'text-red-700 dark:text-red-200',
    bg: 'bg-red-100 dark:bg-red-900/40',
    icon: XMarkIcon,
    label: 'Lost',
  },
};

const frequencyLabels: Record<string, string> = {
  ONE_TIME: 'One-time',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
};

const approvalStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  NONE: { label: 'Not submitted', color: 'text-slate-700', bg: 'bg-slate-100' },
  PENDING: { label: 'Awaiting partner approval', color: 'text-amber-800', bg: 'bg-amber-100' },
  APPROVED: { label: 'Partner approved', color: 'text-emerald-800', bg: 'bg-emerald-100' },
  REJECTED: { label: 'Rejected by partner', color: 'text-red-800', bg: 'bg-red-100' },
};

const APPROVER_ROLES = new Set(['ADMIN', 'PARTNER', 'MD', 'MANAGER']);
const PARTNER_OVERRIDE_ROLES = new Set(['ADMIN', 'PARTNER', 'MD']);
const SUBMITTER_ROLES = new Set(['JUNIOR', 'SENIOR']);

export type ProposalDetailTab = 'overview' | 'audit';

/**
 * Everything the section components and the detail shell read from the provider.
 * Field-for-field this mirrors what the monolithic ProposalDetail exposed to its
 * own JSX via closure.
 */
export interface ProposalDetailContextValue {
  // Identity & environment
  id?: string;
  tenant: Tenant | null;
  activeTab: ProposalDetailTab;
  setActiveTab: (tab: ProposalDetailTab) => void;

  // Data & reloaders
  proposal: any;
  loadProposal: () => Promise<void>;
  auditTrail: any[];
  loadingAudit: boolean;
  loadAuditTrail: () => Promise<void>;

  // Signature capture & forensics
  showSignaturePad: boolean;
  setShowSignaturePad: Dispatch<SetStateAction<boolean>>;
  setSignatureData: Dispatch<SetStateAction<string | null>>;
  signatoryName: string;
  setSignatoryName: Dispatch<SetStateAction<string>>;
  signatoryPosition: string;
  setSignatoryPosition: Dispatch<SetStateAction<string>>;
  handleSignature: (signature: string) => Promise<void>;
  downloadSignatureCertificate: (signatureId: string) => Promise<void>;
  downloadSignatureAuditJson: (signatureId: string) => Promise<void>;

  // Cover letter editing
  coverLetterDraft: string;
  setCoverLetterDraft: Dispatch<SetStateAction<string>>;
  editingCoverLetter: boolean;
  setEditingCoverLetter: Dispatch<SetStateAction<boolean>>;
  savingCoverLetter: boolean;
  handleSaveCoverLetter: () => Promise<void>;
  handleInsertDefaultCoverLetter: () => void;

  // Documents & share links
  downloadPDF: () => Promise<void>;
  handlePrint: () => Promise<void>;
  generateFullTerms: () => string;
  copyingLink: boolean;
  handleCopyClientLink: () => Promise<void>;
  copyingPortalLink: boolean;
  handleCopyPortalLink: () => Promise<void>;

  // Send & approval workflow
  showSendEmailPreview: boolean;
  setShowSendEmailPreview: Dispatch<SetStateAction<boolean>>;
  openSendFlow: () => void;
  handleSend: (approved?: {
    subject: string;
    textBody: string;
    htmlBody?: string;
  }) => Promise<void>;
  handleSubmitForApproval: () => Promise<void>;
  handleApproveProposal: () => Promise<void>;
  handleRejectProposal: () => Promise<void>;
  showRejectModal: boolean;
  setShowRejectModal: Dispatch<SetStateAction<boolean>>;
  rejectionReason: string;
  setRejectionReason: Dispatch<SetStateAction<string>>;
  approvalActionLoading: boolean;

  // Lifecycle actions (rescind / delete / mark lost)
  showWithdrawModal: boolean;
  setShowWithdrawModal: Dispatch<SetStateAction<boolean>>;
  withdrawLoading: boolean;
  handleWithdrawProposal: () => Promise<void>;
  showDeleteModal: boolean;
  setShowDeleteModal: Dispatch<SetStateAction<boolean>>;
  deleteLoading: boolean;
  handleDeleteProposal: () => Promise<void>;
  showMarkLostModal: boolean;
  setShowMarkLostModal: Dispatch<SetStateAction<boolean>>;
  markLostLoading: boolean;
  handleMarkProposalLost: () => Promise<void>;
  markLostReason: DeclineReason;
  setMarkLostReason: Dispatch<SetStateAction<DeclineReason>>;
  markLostNotes: string;
  setMarkLostNotes: Dispatch<SetStateAction<string>>;

  // Pricing
  groupTotals: any;
  pricingBreakdown: any;
  hasMixedVatRates: boolean;

  // Derived status & permissions
  status: { color: string; bg: string; icon: any; label: string };
  StatusIcon: any;
  approvalStatus: string;
  approvalStatusUi: { label: string; color: string; bg: string };
  isApprover: boolean;
  canSubmitForApproval: boolean;
  canSendDraft: boolean;
  showClientLinkButton: boolean;
  canWithdrawProposal: boolean;
  canMarkAsLost: boolean;
  canDeleteProposal: boolean;
  canManageProposal: boolean;
  clientOpenCount: number;
  canEditCoverLetter: boolean;
  firstViewedAt: Date | null;
  lastViewedAt: Date | null;
  signedAt: Date | null;
  auditEventCount: number;
}

const ProposalDetailContext = createContext<ProposalDetailContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its provider by design
export function useProposalDetail(): ProposalDetailContextValue {
  const ctx = useContext(ProposalDetailContext);
  if (!ctx) {
    throw new Error('useProposalDetail must be used within a ProposalDetailProvider');
  }
  return ctx;
}

interface ProposalDetailProviderProps {
  children: ReactNode;
}

export function ProposalDetailProvider({ children }: ProposalDetailProviderProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showMarkLostModal, setShowMarkLostModal] = useState(false);
  const [markLostLoading, setMarkLostLoading] = useState(false);
  const [markLostReason, setMarkLostReason] = useState<DeclineReason>('PRICE');
  const [markLostNotes, setMarkLostNotes] = useState('');

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
        error?.response?.data?.error?.message || error?.response?.data?.message || error?.message;
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

  const handleWithdrawProposal = async () => {
    if (!id) return;
    try {
      setWithdrawLoading(true);
      await apiClient.withdrawProposal(id);
      toast.success('Proposal rescinded — client can no longer sign. Edit and resend when ready.');
      setShowWithdrawModal(false);
      loadProposal();
      loadAuditTrail();
    } catch {
      // handled by API interceptor
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleDeleteProposal = async () => {
    if (!id) return;
    try {
      setDeleteLoading(true);
      await apiClient.deleteProposal(id);
      toast.success('Quotation deleted');
      setShowDeleteModal(false);
      navigate('/proposals');
    } catch {
      // handled by API interceptor
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleMarkProposalLost = async () => {
    if (!id) return;
    try {
      setMarkLostLoading(true);
      await apiClient.markProposalLost(id, {
        declineReason: markLostReason,
        reason: markLostNotes.trim() || undefined,
      });
      toast.success('Quotation marked as lost');
      setShowMarkLostModal(false);
      setMarkLostNotes('');
      loadProposal();
      loadAuditTrail();
    } catch {
      // handled by API interceptor
    } finally {
      setMarkLostLoading(false);
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
        const link = `${window.location.origin}${appPath(`/proposals/view/${proposal.shareToken}`)}`;
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
          toast.error('Link created but not copied. Copy manually: ' + response.data.shareUrl, {
            duration: 10000,
          });
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
        addresseeName: (
          proposal.client?.contactName?.trim() ||
          proposal.client?.name ||
          'Client'
        ).trim(),
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
      return {
        monthlyExVat: 0,
        monthlyVat: 0,
        monthlyIncVat: 0,
        oneOffExVat: 0,
        oneOffVat: 0,
        oneOffIncVat: 0,
      };
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
          acc.monthlyExVat += monthlyEquivalentFor(lineTotal, freq);
          acc.monthlyVat += monthlyEquivalentFor(vatAmt, freq);
          acc.monthlyIncVat += monthlyEquivalentFor(gross, freq);
        }
        return acc;
      },
      {
        monthlyExVat: 0,
        monthlyVat: 0,
        monthlyIncVat: 0,
        oneOffExVat: 0,
        oneOffVat: 0,
        oneOffIncVat: 0,
      }
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
  const approvalStatusUi = approvalStatusConfig[approvalStatus] || approvalStatusConfig.NONE;
  const userRole = user?.role;
  const isApprover = userRole ? APPROVER_ROLES.has(userRole) : false;
  const canOverrideApproval = userRole ? PARTNER_OVERRIDE_ROLES.has(userRole) : false;
  const canSubmitForApproval =
    proposal.status === 'DRAFT' &&
    ['NONE', 'REJECTED'].includes(approvalStatus) &&
    (userRole ? SUBMITTER_ROLES.has(userRole) || isApprover : false);
  const canSendDraft =
    proposal.status === 'DRAFT' && (canOverrideApproval || approvalStatus === 'APPROVED');
  const showClientLinkButton = !['DECLINED', 'EXPIRED', 'WITHDRAWN', 'ARCHIVED', 'LOST'].includes(
    proposal.status
  );
  const canWithdrawProposal = proposal.status === 'SENT' || proposal.status === 'VIEWED';
  const canMarkAsLost = ['DRAFT', 'SENT', 'VIEWED', 'EXPIRED', 'WITHDRAWN'].includes(
    proposal.status
  );
  const canDeleteProposal = proposal.status !== 'ACCEPTED' && proposal.status !== 'ARCHIVED';
  const deleteManageRoles = new Set(['ADMIN', 'PARTNER', 'MD', 'MANAGER']);
  const canManageProposal = userRole ? deleteManageRoles.has(userRole) : false;
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

  // Plain object literal, recreated each render — matches the monolith's
  // "everything re-renders on any state change" semantics.
  const value: ProposalDetailContextValue = {
    id,
    tenant,
    activeTab,
    setActiveTab,
    proposal,
    loadProposal,
    auditTrail,
    loadingAudit,
    loadAuditTrail,
    showSignaturePad,
    setShowSignaturePad,
    setSignatureData,
    signatoryName,
    setSignatoryName,
    signatoryPosition,
    setSignatoryPosition,
    handleSignature,
    downloadSignatureCertificate,
    downloadSignatureAuditJson,
    coverLetterDraft,
    setCoverLetterDraft,
    editingCoverLetter,
    setEditingCoverLetter,
    savingCoverLetter,
    handleSaveCoverLetter,
    handleInsertDefaultCoverLetter,
    downloadPDF,
    handlePrint,
    generateFullTerms,
    copyingLink,
    handleCopyClientLink,
    copyingPortalLink,
    handleCopyPortalLink,
    showSendEmailPreview,
    setShowSendEmailPreview,
    openSendFlow,
    handleSend,
    handleSubmitForApproval,
    handleApproveProposal,
    handleRejectProposal,
    showRejectModal,
    setShowRejectModal,
    rejectionReason,
    setRejectionReason,
    approvalActionLoading,
    showWithdrawModal,
    setShowWithdrawModal,
    withdrawLoading,
    handleWithdrawProposal,
    showDeleteModal,
    setShowDeleteModal,
    deleteLoading,
    handleDeleteProposal,
    showMarkLostModal,
    setShowMarkLostModal,
    markLostLoading,
    handleMarkProposalLost,
    markLostReason,
    setMarkLostReason,
    markLostNotes,
    setMarkLostNotes,
    groupTotals,
    pricingBreakdown,
    hasMixedVatRates,
    status,
    StatusIcon,
    approvalStatus,
    approvalStatusUi,
    isApprover,
    canSubmitForApproval,
    canSendDraft,
    showClientLinkButton,
    canWithdrawProposal,
    canMarkAsLost,
    canDeleteProposal,
    canManageProposal,
    clientOpenCount,
    canEditCoverLetter,
    firstViewedAt,
    lastViewedAt,
    signedAt,
    auditEventCount,
  };

  return <ProposalDetailContext.Provider value={value}>{children}</ProposalDetailContext.Provider>;
}
