import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';

type FormState = {
  idDocumentType: 'PASSPORT' | 'DRIVING_LICENCE' | 'OTHER';
  idDocumentTypeOther: string;
  fullLegalName: string;
  dateOfBirth: string;
  registeredAddress: string;
  nationality: string;
  sourceOfFunds: string;
  isPep: boolean;
  pepDetails: string;
  confirmAccurate: boolean;
};

const emptyForm = (): FormState => ({
  idDocumentType: 'PASSPORT',
  idDocumentTypeOther: '',
  fullLegalName: '',
  dateOfBirth: '',
  registeredAddress: '',
  nationality: 'British',
  sourceOfFunds: '',
  isPep: false,
  pepDetails: '',
  confirmAccurate: false,
});

export default function AmlOnboarding() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [context, setContext] = useState<any>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = (await apiClient.getAmlOnboarding(token)) as any;
        if (res.success) {
          setContext(res.data);
          if (res.data.existingSubmission) {
            const e = res.data.existingSubmission;
            setForm({
              idDocumentType: e.idDocumentType || 'PASSPORT',
              idDocumentTypeOther: e.idDocumentTypeOther || '',
              fullLegalName: e.fullLegalName || res.data.client?.contactName || '',
              dateOfBirth: e.dateOfBirth || '',
              registeredAddress: e.registeredAddress || '',
              nationality: e.nationality || 'British',
              sourceOfFunds: e.sourceOfFunds || '',
              isPep: !!e.isPep,
              pepDetails: e.pepDetails || '',
              confirmAccurate: false,
            });
            if (res.data.amlSubmittedAt) setDone(true);
          } else {
            setForm((f) => ({
              ...f,
              fullLegalName: res.data.client?.contactName || res.data.client?.name || '',
            }));
          }
        }
      } catch {
        setError('This link is invalid or has expired. Please contact your accountant.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !form.confirmAccurate) {
      toast.error('Please confirm your details are accurate');
      return;
    }
    if (form.isPep && !form.pepDetails.trim()) {
      toast.error('Please provide PEP details');
      return;
    }

    setSubmitting(true);
    try {
      const res = (await apiClient.submitAmlOnboarding(token, {
        ...form,
        confirmAccurate: true,
      })) as any;
      if (res.success) {
        setDone(true);
        toast.success('Details submitted — thank you');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const primary = context?.practice?.primaryColor || '#0ea5e9';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="glass-tile p-8 max-w-md text-center">
          <ExclamationCircleIcon className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <p className="text-slate-700 dark:text-slate-300">{error}</p>
        </div>
      </div>
    );
  }

  if (done || context?.amlCompletedAt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-emerald-50/40 dark:from-slate-950 dark:to-emerald-950/20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-tile p-10 max-w-lg text-center"
        >
          <CheckCircleIcon className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {context?.amlCompletedAt ? 'Verification complete' : 'Thank you'}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {context?.amlCompletedAt
              ? 'Your AML verification has been completed by your practice.'
              : 'Your details have been received. Your accountant will review them and be in touch if anything else is needed.'}
          </p>
          <p className="mt-4 text-xs text-slate-500">{context?.practice?.name}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-primary-950/20 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${primary}, ${primary}dd)` }}
          >
            <ShieldCheckIcon className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">ID &amp; AML verification</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {context?.practice?.name} needs a few details to complete your anti-money laundering checks. This
            secure form takes about 5 minutes.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
            <BuildingOfficeIcon className="h-4 w-4" />
            {context?.client?.name}
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="glass-tile p-6 sm:p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
              Photo ID document
            </label>
            <select
              className="input-field w-full"
              value={form.idDocumentType}
              onChange={(e) =>
                setForm({ ...form, idDocumentType: e.target.value as FormState['idDocumentType'] })
              }
            >
              <option value="PASSPORT">Passport</option>
              <option value="DRIVING_LICENCE">Driving licence</option>
              <option value="OTHER">Other government-issued ID</option>
            </select>
            {form.idDocumentType === 'OTHER' && (
              <input
                className="input-field w-full mt-2"
                placeholder="Please specify document type"
                value={form.idDocumentTypeOther}
                onChange={(e) => setForm({ ...form, idDocumentTypeOther: e.target.value })}
              />
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full legal name (as on ID)</label>
              <input
                required
                className="input-field w-full"
                value={form.fullLegalName}
                onChange={(e) => setForm({ ...form, fullLegalName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date of birth</label>
              <input
                required
                type="date"
                className="input-field w-full"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Registered / home address</label>
            <textarea
              required
              rows={3}
              className="input-field w-full"
              value={form.registeredAddress}
              onChange={(e) => setForm({ ...form, registeredAddress: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nationality</label>
            <input
              required
              className="input-field w-full"
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Source of funds / wealth (brief)</label>
            <textarea
              required
              rows={2}
              className="input-field w-full"
              placeholder="e.g. Trading income, salary, property rental, inheritance…"
              value={form.sourceOfFunds}
              onChange={(e) => setForm({ ...form, sourceOfFunds: e.target.value })}
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPep}
                onChange={(e) => setForm({ ...form, isPep: e.target.checked })}
                className="mt-1 accent-primary-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                I am a Politically Exposed Person (PEP), or a close associate or family member of a PEP
              </span>
            </label>
            {form.isPep && (
              <textarea
                required
                rows={2}
                className="input-field w-full"
                placeholder="Please provide details"
                value={form.pepDetails}
                onChange={(e) => setForm({ ...form, pepDetails: e.target.value })}
              />
            )}
          </div>

          <label className="flex items-start gap-3 cursor-pointer text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.confirmAccurate}
              onChange={(e) => setForm({ ...form, confirmAccurate: e.target.checked })}
              className="mt-0.5 accent-primary-600"
            />
            I confirm the information provided is accurate and I understand this is used for AML compliance
            purposes under UK regulations.
          </label>

          <button
            type="submit"
            disabled={submitting || !form.confirmAccurate}
            className="btn-primary w-full py-3"
            style={{ backgroundColor: primary }}
          >
            {submitting ? 'Submitting…' : 'Submit securely'}
          </button>

          <p className="text-[10px] text-center text-slate-400 leading-snug">
            Your data is transmitted securely and stored only for compliance purposes by {context?.practice?.name}.
          </p>
        </form>
      </div>
    </div>
  );
}
