import { useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import { readLetterSign } from './letterTrack';

type Props = {
  letterId: string;
  metaJson?: string | null;
};

export default function LetterEsignPanel({ letterId, metaJson }: Props) {
  const sign = readLetterSign(metaJson);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createLink() {
    setBusy(true);
    try {
      const res = await apiClient.post(`/practice-letters/${letterId}/sign-link`);
      const url = res.data?.data?.url ?? res.data?.url;
      setLink(url);
      toast.success('Sign link ready — copy it before you leave this page');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      toast.error(err.response?.data?.error?.message || 'Could not create a sign link');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Sign link copied');
    } catch {
      toast.error('Could not copy the link');
    }
  }

  if (sign?.signedAt) {
    return (
      <div
        className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/30"
        data-testid="letter-signed-banner"
      >
        <p className="font-medium text-emerald-900 dark:text-emerald-200">Signed</p>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {sign.signedBy || 'Client'}
          {sign.signerEmail ? ` · ${sign.signerEmail}` : ''}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40"
      data-testid="letter-esign-panel"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">E-sign</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Send a link. The client signs in the browser — we do not email it yet.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-accent text-xs"
          disabled={busy}
          onClick={() => void createLink()}
        >
          {busy ? 'Creating…' : sign?.tokenHash ? 'Replace sign link' : 'Create sign link'}
        </button>
        {link && (
          <button type="button" className="btn-secondary text-xs" onClick={() => void copyLink()}>
            Copy link
          </button>
        )}
      </div>
      {link && (
        <p className="mt-2 break-all text-2xs text-slate-500" data-testid="letter-sign-url">
          {link}
        </p>
      )}
    </div>
  );
}
