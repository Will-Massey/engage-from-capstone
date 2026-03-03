import { useState } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
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

  // Email form state
  const [emailData, setEmailData] = useState({
    to: clientEmail,
    cc: '',
    subject: `Proposal: ${proposalReference}`,
    message: '',
    includePdf: true,
  });
  const [isSending, setIsSending] = useState(false);

  const generateLink = async () => {
    setIsGenerating(true);
    try {
      const response = await apiClient.post(`/proposals/${proposalId}/share`, {
        expiryDays: 30,
      }) as any;

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
      const response = await apiClient.post(`/proposals/${proposalId}/email`, {
        to: emailData.to,
        cc: emailData.cc ? emailData.cc.split(',').map((e) => e.trim()) : undefined,
        subject: emailData.subject,
        message: emailData.message,
        includePdf: emailData.includePdf,
      }) as any;

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
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />

        {/* Dialog */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">Share Proposal</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('link')}
              className={`flex-1 py-3 px-4 text-sm font-medium text-center border-b-2 transition-colors ${
                activeTab === 'link'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
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
                  : 'border-transparent text-gray-500 hover:text-gray-700'
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
                {!shareData ? (
                  <div className="text-center py-8">
                    <LinkIcon className="mx-auto h-12 w-12 text-gray-300" />
                    <p className="mt-2 text-gray-500">
                      Generate a shareable link for your client to view this proposal
                    </p>
                    <button
                      onClick={generateLink}
                      disabled={isGenerating}
                      className="mt-4 btn-primary"
                    >
                      {isGenerating ? 'Generating...' : 'Generate Link'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
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
                          className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg hover:bg-gray-200"
                        >
                          {copied ? (
                            <CheckIcon className="h-5 w-5 text-green-600" />
                          ) : (
                            <ClipboardIcon className="h-5 w-5 text-gray-500" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-700">
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
                  <label className="block text-sm font-medium text-gray-700">To</label>
                  <input
                    type="email"
                    value={emailData.to}
                    onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
                    className="mt-1 input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">CC (optional)</label>
                  <input
                    type="text"
                    value={emailData.cc}
                    onChange={(e) => setEmailData({ ...emailData, cc: e.target.value })}
                    placeholder="email1@example.com, email2@example.com"
                    className="mt-1 input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Subject</label>
                  <input
                    type="text"
                    value={emailData.subject}
                    onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
                    className="mt-1 input-field"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
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
                    onChange={(e) =>
                      setEmailData({ ...emailData, includePdf: e.target.checked })
                    }
                    className="h-4 w-4 text-primary-600 rounded"
                  />
                  <label htmlFor="includePdf" className="ml-2 text-sm text-gray-700">
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
