import { useState, useEffect } from 'react';
import { apiClient } from '../../utils/api';
import { toast } from 'react-hot-toast';
import {
  XMarkIcon,
  LinkIcon,
  EnvelopeIcon,
  CheckIcon,
  ClipboardIcon,
} from '@heroicons/react/24/outline';

interface ShareProposalDialogProps {
  proposalId: string;
  proposalReference: string;
  clientEmail: string;
  onClose: () => void;
}

const ShareProposalDialog = ({
  proposalId,
  proposalReference,
  clientEmail,
  onClose,
}: ShareProposalDialogProps) => {
  const [activeTab, setActiveTab] = useState<'link' | 'email'>('link');
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareData, setShareData] = useState<{
    token: string;
    shareUrl: string;
    expiresAt: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [proposalPreview, setProposalPreview] = useState<{
    title: string;
    reference: string;
    clientName: string;
    total: number;
    status: string;
  } | null>(null);

  // Email form state
  const [emailData, setEmailData] = useState({
    to: clientEmail,
    cc: '',
    subject: `Proposal: ${proposalReference}`,
    message: '',
    includePdf: true,
  });
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await apiClient.getProposal(proposalId)) as any;
        if (!cancelled && res?.success && res.data) {
          setProposalPreview({
            title: res.data.title || proposalReference,
            reference: res.data.reference || proposalReference,
            clientName: res.data.client?.name || 'Client',
            total: res.data.total || 0,
            status: res.data.status || 'DRAFT',
          });
        }
      } catch {
        if (!cancelled) {
          setProposalPreview({
            title: proposalReference,
            reference: proposalReference,
            clientName: clientEmail,
            total: 0,
            status: 'DRAFT',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId, proposalReference, clientEmail]);

  const generateLink = async () => {
    setIsGenerating(true);
    try {
      const response = (await apiClient.post(`/proposals/${proposalId}/share`, {
        expiryDays: 30,
      })) as any;

      if (response.success) {
        setShareData(response.data);
        toast.success('Shareable link generated');
      }
    } catch (error) {
      toast.error('Failed to generate link');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    if (shareData?.shareUrl) {
      await navigator.clipboard.writeText(shareData.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied to clipboard');
    }
  };

  const sendEmail = async () => {
    setIsSending(true);
    try {
      const response = (await apiClient.post(`/proposals/${proposalId}/email`, {
        to: emailData.to,
        cc: emailData.cc ? emailData.cc.split(',').map((e) => e.trim()) : undefined,
        subject: emailData.subject,
        message: emailData.message,
        includePdf: emailData.includePdf,
      })) as any;

      if (response.success) {
        toast.success('Proposal sent successfully');
        onClose();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Dialog */}
        <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full border border-slate-200 dark:border-slate-700">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Share Proposal</h3>
            <button
              onClick={onClose}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-300"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setActiveTab('link')}
              className={`flex-1 py-3 px-4 text-sm font-medium text-center border-b-2 transition-colors ${
                activeTab === 'link'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <LinkIcon className="h-4 w-4 inline mr-2" />
              Share Link
            </button>
            <button
              onClick={() => setActiveTab('email')}
              className={`flex-1 py-3 px-4 text-sm font-medium text-center border-b-2 transition-colors ${
                activeTab === 'email'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <EnvelopeIcon className="h-4 w-4 inline mr-2" />
              Send Email
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {activeTab === 'link' ? (
              <div className="space-y-4">
                {showPreview && proposalPreview && !shareData && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 text-left">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Preview before sharing
                    </p>
                    <h4 className="mt-2 font-semibold text-slate-900 dark:text-white">
                      {proposalPreview.title}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Ref: {proposalPreview.reference}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Client: {proposalPreview.clientName}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                      Total: £
                      {Number(proposalPreview.total).toLocaleString('en-GB', {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Status: {proposalPreview.status}
                    </p>
                  </div>
                )}
                {!shareData ? (
                  <div className="text-center py-6">
                    <LinkIcon className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
                    <p className="mt-2 text-slate-500 dark:text-slate-400">
                      Generate a secure link for your client to view and sign this proposal
                    </p>
                    <button
                      onClick={generateLink}
                      disabled={isGenerating}
                      className="mt-4 btn-primary"
                    >
                      {isGenerating ? 'Generating...' : 'Generate share link'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Shareable Link
                      </label>
                      <div className="mt-1 flex">
                        <input
                          type="text"
                          value={shareData.shareUrl}
                          readOnly
                          className="input-field rounded-r-none flex-1"
                        />
                        <button
                          onClick={copyToClipboard}
                          className="px-4 py-2 bg-slate-100 dark:bg-slate-700 border border-l-0 border-slate-300 dark:border-slate-600 rounded-r-lg hover:bg-slate-200 dark:hover:bg-slate-600"
                        >
                          {copied ? (
                            <CheckIcon className="h-5 w-5 text-green-600" />
                          ) : (
                            <ClipboardIcon className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900/50">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        <strong>Expires:</strong>{' '}
                        {new Date(shareData.expiresAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>

                    <div className="flex space-x-3">
                      <button onClick={generateLink} className="btn-secondary flex-1">
                        Regenerate Link
                      </button>
                      <button onClick={onClose} className="btn-primary flex-1">
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    To
                  </label>
                  <input
                    type="email"
                    value={emailData.to}
                    onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                    className="mt-1 input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    CC (optional)
                  </label>
                  <input
                    type="text"
                    value={emailData.cc}
                    onChange={(e) => setEmailData({ ...emailData, cc: e.target.value })}
                    placeholder="email1@example.com, email2@example.com"
                    className="mt-1 input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={emailData.subject}
                    onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                    className="mt-1 input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Message (optional)
                  </label>
                  <textarea
                    value={emailData.message}
                    onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
                    rows={3}
                    className="mt-1 input-field"
                    placeholder="Add a personal message..."
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="includePdf"
                    checked={emailData.includePdf}
                    onChange={(e) => setEmailData({ ...emailData, includePdf: e.target.checked })}
                    className="h-4 w-4 text-primary-600 rounded"
                  />
                  <label
                    htmlFor="includePdf"
                    className="ml-2 text-sm text-slate-700 dark:text-slate-300"
                  >
                    Include PDF attachment
                  </label>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button onClick={onClose} className="btn-secondary flex-1">
                    Cancel
                  </button>
                  <button
                    onClick={sendEmail}
                    disabled={isSending || !emailData.to}
                    className="btn-primary flex-1"
                  >
                    {isSending ? 'Sending...' : 'Send Proposal'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareProposalDialog;
