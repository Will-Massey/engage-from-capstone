import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircleIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import SignaturePad from '../../components/signature/SignaturePad';
import { apiClient } from '../../utils/api';
import { letterSignConsentText } from '../letters/letterTrack';

type PublicLetter = {
  title: string;
  type: string;
  bodyHtml: string;
  clientName: string;
  practiceName: string;
  signed: boolean;
  signedBy: string | null;
  signedAt: string | null;
};

export default function LetterSign() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [letter, setLetter] = useState<PublicLetter | null>(null);
  const [signedBy, setSignedBy] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await apiClient.get(`/public/practice-letters/${token}`);
        setLetter(res.data?.data ?? res.data);
      } catch {
        setError('This link is invalid or has been replaced. Please contact your accountant.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function submitSign() {
    if (!token || !letter) return;
    if (!signatureData) {
      toast.error('Please provide your signature');
      return;
    }
    if (signedBy.trim().length < 2) {
      toast.error('Please provide your name');
      return;
    }
    if (!signerEmail.trim()) {
      toast.error('Please provide your email');
      return;
    }
    if (!consentAccepted) {
      toast.error('Please confirm you are authorised to sign');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/public/practice-letters/${token}/sign`, {
        signedBy: signedBy.trim(),
        signerEmail: signerEmail.trim(),
        signatureData,
        consentAccepted: true,
        deviceInfo: JSON.stringify({
          platform: navigator.platform,
          language: navigator.language,
        }),
      });
      setLetter({
        ...letter,
        signed: true,
        signedBy: signedBy.trim(),
        signedAt: new Date().toISOString(),
      });
      toast.success('Letter signed');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      toast.error(err.response?.data?.error?.message || 'Could not sign this letter');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (error || !letter) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
        <div className="max-w-md text-center">
          <ExclamationCircleIcon className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <p className="text-slate-700 dark:text-slate-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {letter.practiceName}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">
            {letter.title}
          </h1>
          <p className="text-sm text-slate-500">{letter.clientName}</p>
        </div>

        <div
          className="prose prose-sm max-w-none rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: letter.bodyHtml }}
        />

        {letter.signed ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
            <CheckCircleIcon className="mb-2 h-8 w-8 text-emerald-600" />
            <p className="font-semibold text-slate-900 dark:text-slate-50">Signed</p>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {letter.signedBy || 'The client'} has signed this letter.
            </p>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <DocumentTextIcon className="h-4 w-4 text-emerald-600" />
              Sign this letter
            </p>
            <label className="block text-xs text-slate-500">
              Full name
              <input
                className="input-field mt-1"
                value={signedBy}
                onChange={(e) => setSignedBy(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="block text-xs text-slate-500">
              Email
              <input
                className="input-field mt-1"
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <SignaturePad onSave={setSignatureData} fullWidth hideConfirm />
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="mt-1"
                checked={consentAccepted}
                onChange={(e) => setConsentAccepted(e.target.checked)}
              />
              <span>{letterSignConsentText(letter.clientName)}</span>
            </label>
            <button
              type="button"
              className="btn-accent"
              disabled={submitting}
              onClick={() => void submitSign()}
            >
              {submitting ? 'Signing…' : 'Sign letter'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
