import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BuildingOfficeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import ComingSoonCallout from '../../components/ui/ComingSoonCallout';

export default function AmlOnboarding() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [practiceName, setPracticeName] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = (await apiClient.getAmlOnboarding(token)) as any;
        if (res.success) {
          setPracticeName(res.data?.practice?.name ?? null);
          setClientName(res.data?.client?.name ?? null);
          if (res.data?.amlSubmittedAt || res.data?.amlCompletedAt) {
            setDone(true);
          }
        }
      } catch {
        setError('This link is invalid or has expired. Please contact your accountant.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

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

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-emerald-50/40 dark:from-slate-950 dark:to-emerald-950/20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-tile p-10 max-w-lg text-center"
        >
          <CheckCircleIcon className="h-14 w-14 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Thank you</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Your details have already been received. Your accountant will be in touch if anything
            else is needed.
          </p>
          {practiceName ? <p className="mt-4 text-xs text-slate-500">{practiceName}</p> : null}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-primary-950/20 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-slate-900 text-white shadow-lg">
            <ShieldCheckIcon className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            ID verification coming soon
          </h1>
          {clientName ? (
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
              <BuildingOfficeIcon className="h-4 w-4" />
              {clientName}
            </div>
          ) : null}
        </motion.div>

        <ComingSoonCallout
          title="Automated ID checks are paused"
          testId="aml-onboarding-coming-soon"
        >
          <p>
            {practiceName || 'Your accountant'} is reviewing identity-check providers. Please
            contact them if they have asked you to verify your identity another way — this page will
            not run an automated check.
          </p>
        </ComingSoonCallout>
      </div>
    </div>
  );
}
