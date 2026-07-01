import { useEffect, useState } from 'react';
import { BuildingOffice2Icon, LockClosedIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';

interface FirmGroupData {
  assigned: boolean;
  firmGroup: {
    id: string;
    name: string;
    slug: string;
    practiceCount: number;
    createdAt: string;
  } | null;
  practice: { id: string; name: string; subdomain: string };
  message: string;
  scaffold: boolean;
}

export default function FirmGroupSettings() {
  const [data, setData] = useState<FirmGroupData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = (await apiClient.getFirmGroup()) as any;
        if (res.success) {
          setData(res.data);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <div className="h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-4">
        <LockClosedIcon className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-slate-900 dark:text-white">Read-only placeholder</p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {data?.message ||
              'Multi-firm workspace administration will be available in a future release.'}
          </p>
        </div>
      </div>

      {data?.assigned && data.firmGroup ? (
        <div className="rounded-xl border border-primary-200 dark:border-primary-800/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <BuildingOffice2Icon className="h-5 w-5 text-primary-600" />
            <h4 className="font-semibold text-slate-900 dark:text-white">{data.firmGroup.name}</h4>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Group slug</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{data.firmGroup.slug}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Practices in group</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {data.firmGroup.practiceCount}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Your practice</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {data.practice.name} ({data.practice.subdomain})
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center text-sm text-slate-600 dark:text-slate-400">
          No firm group assigned yet. Contact Capstone support to link your practice to an accounting
          group workspace.
        </div>
      )}
    </div>
  );
}