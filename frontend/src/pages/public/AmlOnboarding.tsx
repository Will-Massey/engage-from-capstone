import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  BuildingOfficeIcon,
  DocumentArrowUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

type UploadedFileMeta = {
  fileName: string;
  mimeType: string;
  data: string;
  sizeBytes: number;
};

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

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readFileAsDataUrl(file: File): Promise<UploadedFileMeta> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please upload a JPEG, PNG, WebP, or PDF file.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Each file must be 10 MB or smaller.');
  }

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the selected file'));
    reader.readAsDataURL(file);
  });

  return {
    fileName: file.name,
    mimeType: file.type,
    data,
    sizeBytes: file.size,
  };
}

interface FileUploadFieldProps {
  label: string;
  hint: string;
  value: UploadedFileMeta | null;
  existingMeta?: { fileName?: string; sizeBytes?: number } | null;
  onChange: (file: UploadedFileMeta | null) => void;
  disabled?: boolean;
}

function FileUploadField({
  label,
  hint,
  value,
  existingMeta,
  onChange,
  disabled,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const meta = await readFileAsDataUrl(file);
      onChange(meta);
    } catch (err: any) {
      toast.error(err?.message || 'Upload failed');
    }
  };

  const displayName = value?.fileName ?? existingMeta?.fileName;
  const displaySize = value?.sizeBytes ?? existingMeta?.sizeBytes;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
        {label}
      </label>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{hint}</p>

      {displayName ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
              {displayName}
            </p>
            {displaySize ? (
              <p className="text-xs text-slate-500">{formatFileSize(displaySize)}</p>
            ) : (
              <p className="text-xs text-slate-500">Previously uploaded</p>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="shrink-0 p-1 rounded-md text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              aria-label={`Remove ${label}`}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      ) : (
        <div
          className={`relative rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver
              ? 'border-primary-400 bg-primary-50/40 dark:bg-primary-950/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-primary-300'
          } ${disabled ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <DocumentArrowUpIcon className="h-8 w-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Drag and drop or <span className="text-primary-600 font-medium">browse</span>
          </p>
          <p className="text-xs text-slate-500 mt-1">JPEG, PNG, WebP or PDF — max 10 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            disabled={disabled}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
      )}
    </div>
  );
}

export default function AmlOnboarding() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [context, setContext] = useState<any>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [photoIdFile, setPhotoIdFile] = useState<UploadedFileMeta | null>(null);
  const [proofOfAddressFile, setProofOfAddressFile] = useState<UploadedFileMeta | null>(null);

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
    if (!photoIdFile) {
      toast.error('Please upload a photo of your ID document');
      return;
    }
    if (!proofOfAddressFile) {
      toast.error('Please upload proof of address');
      return;
    }

    setSubmitting(true);
    try {
      const res = (await apiClient.submitAmlOnboarding(token, {
        ...form,
        confirmAccurate: true,
        photoIdDocument: {
          fileName: photoIdFile.fileName,
          mimeType: photoIdFile.mimeType,
          data: photoIdFile.data,
        },
        proofOfAddressDocument: {
          fileName: proofOfAddressFile.fileName,
          mimeType: proofOfAddressFile.mimeType,
          data: proofOfAddressFile.data,
        },
      })) as any;
      if (res.success) {
        setDone(true);
        toast.success('Details submitted — thank you');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const primary = context?.practice?.primaryColor || '#0ea5e9';
  const existing = context?.existingSubmission;

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
              : 'Your details and documents have been received securely. Your accountant will review them and be in touch if anything else is needed.'}
          </p>
          <p className="mt-4 text-xs text-slate-500">{context?.practice?.name}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-primary-950/20 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${primary}, ${primary}dd)` }}
          >
            <ShieldCheckIcon className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            ID &amp; AML verification
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {context?.practice?.name} needs a few details to complete your anti-money laundering
            checks. This secure form takes about 5 minutes.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
            <BuildingOfficeIcon className="h-4 w-4" />
            {context?.client?.name}
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="glass-tile p-6 sm:p-8 space-y-5">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/30">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Identity documents
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
              Please upload clear colour copies. We only use these for compliance purposes.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
                ID document type
              </label>
              <select
                className="input-field w-full"
                value={form.idDocumentType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    idDocumentType: e.target.value as FormState['idDocumentType'],
                  })
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

            <FileUploadField
              label="Photo ID"
              hint="Upload a clear photo or scan of your passport, driving licence, or other government ID."
              value={photoIdFile}
              existingMeta={existing?.photoIdDocument}
              onChange={setPhotoIdFile}
            />

            <FileUploadField
              label="Proof of address"
              hint="A utility bill, council tax statement, or bank statement dated within the last 3 months."
              value={proofOfAddressFile}
              existingMeta={existing?.proofOfAddressDocument}
              onChange={setProofOfAddressFile}
            />
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
              placeholder="Include postcode"
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
            <label className="block text-sm font-medium mb-1">
              Source of funds / wealth (brief)
            </label>
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
                I am a Politically Exposed Person (PEP), or a close associate or family member of a
                PEP
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
            I confirm the information provided is accurate and I understand this is used for AML
            compliance purposes under UK regulations.
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
            Your data is transmitted securely and stored only for compliance purposes by{' '}
            {context?.practice?.name}.
          </p>
        </form>
      </div>
    </div>
  );
}
