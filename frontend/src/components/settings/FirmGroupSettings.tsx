import { useCallback, useEffect, useState } from 'react';
import {
  BuildingOffice2Icon,
  PlusIcon,
  TrashIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';

interface FirmGroupPractice {
  id: string;
  name: string;
  subdomain: string;
  isOwner: boolean;
  isCurrent: boolean;
  userCount: number;
  clientCount: number;
}

interface FirmGroupData {
  assigned: boolean;
  canAdmin: boolean;
  isOwnerPractice: boolean;
  firmGroup: {
    id: string;
    name: string;
    slug: string;
    ownerTenantId: string | null;
    practiceCount: number;
  } | null;
  practices: FirmGroupPractice[];
  practice: { id: string; name: string; subdomain: string };
}

export default function FirmGroupSettings() {
  const [data, setData] = useState<FirmGroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createName, setCreateName] = useState('');
  const [editName, setEditName] = useState('');
  const [addSubdomain, setAddSubdomain] = useState('');

  const load = useCallback(async () => {
    try {
      const res = (await apiClient.getFirmGroup()) as any;
      if (res.success) {
        setData(res.data);
        if (res.data.firmGroup?.name) setEditName(res.data.firmGroup.name);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<any>, successMsg: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.success) {
        setData(res.data);
        if (res.data.firmGroup?.name) setEditName(res.data.firmGroup.name);
        toast.success(successMsg);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
  }

  if (!data?.assigned) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Link multiple practices under one accounting group workspace — shared oversight for
          partners across offices, with each practice keeping its own clients and data.
        </p>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 max-w-lg">
          <h4 className="font-semibold text-slate-900 dark:text-white">Create a firm group</h4>
          <p className="text-xs text-slate-500">
            Your practice ({data?.practice.name}) becomes the owner. You can add other practices by
            subdomain afterwards.
          </p>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Group name
          </label>
          <input
            type="text"
            data-testid="firm-group-create-name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="e.g. Capstone Accounting Group"
            className="input-field w-full"
          />
          <button
            type="button"
            data-testid="firm-group-create-button"
            disabled={busy || createName.trim().length < 2}
            onClick={() =>
              run(
                () => apiClient.createFirmGroup({ name: createName.trim() }),
                'Firm group created'
              )
            }
            className="btn-primary text-sm"
          >
            Create firm group
          </button>
        </div>
      </div>
    );
  }

  const group = data.firmGroup!;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary-200 dark:border-primary-800/50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <BuildingOffice2Icon className="h-5 w-5 text-primary-600" />
          <h4 className="font-semibold text-slate-900 dark:text-white">{group.name}</h4>
          {data.isOwnerPractice && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
              Owner practice
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Slug: <span className="font-mono">{group.slug}</span> · {group.practiceCount} practice
          {group.practiceCount === 1 ? '' : 's'}
        </p>
      </div>

      {data.canAdmin && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3 max-w-lg">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Group settings</h4>
          <input
            type="text"
            data-testid="firm-group-edit-name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="input-field w-full"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="firm-group-save-name"
              disabled={busy || editName.trim().length < 2}
              onClick={() =>
                run(
                  () => apiClient.updateFirmGroup({ name: editName.trim() }),
                  'Group name updated'
                )
              }
              className="btn-secondary text-sm"
            >
              Save name
            </button>
            <button
              type="button"
              data-testid="firm-group-dissolve"
              disabled={busy}
              onClick={() => {
                if (
                  !window.confirm(
                    'Dissolve this firm group? All practices will be unlinked. This cannot be undone.'
                  )
                ) {
                  return;
                }
                void run(() => apiClient.dissolveFirmGroup(), 'Firm group dissolved');
              }}
              className="btn-secondary text-sm text-red-600 border-red-200 dark:border-red-800"
            >
              Dissolve group
            </button>
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
          Practices in this group
        </h4>
        <ul className="space-y-2" data-testid="firm-group-practice-list">
          {data.practices.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-white text-sm">
                  {p.name}
                  {p.isCurrent && <span className="ml-2 text-xs text-primary-600">(you)</span>}
                  {p.isOwner && <span className="ml-2 text-xs text-slate-500">owner</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {p.subdomain} · {p.userCount} users · {p.clientCount} clients
                </p>
              </div>
              {data.canAdmin && !p.isOwner && (
                <button
                  type="button"
                  data-testid={`firm-group-remove-${p.subdomain}`}
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`Remove ${p.name} from this firm group?`)) return;
                    void run(
                      () => apiClient.removeFirmGroupPractice(p.id),
                      'Practice removed from group'
                    );
                  }}
                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
                  title="Remove from group"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {data.canAdmin && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-5 space-y-3 max-w-lg">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <PlusIcon className="h-4 w-4" />
            Add a practice
          </h4>
          <p className="text-xs text-slate-500">
            Enter the subdomain of another Engage practice (e.g. <code>demo-practice</code>). It
            must not already belong to another group.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              data-testid="firm-group-add-subdomain"
              value={addSubdomain}
              onChange={(e) => setAddSubdomain(e.target.value)}
              placeholder="practice-subdomain"
              className="input-field flex-1"
            />
            <button
              type="button"
              data-testid="firm-group-add-button"
              disabled={busy || addSubdomain.trim().length < 2}
              onClick={() => {
                const sub = addSubdomain.trim();
                void run(() => apiClient.addFirmGroupPractice(sub), 'Practice added to group').then(
                  () => setAddSubdomain('')
                );
              }}
              className="btn-primary text-sm shrink-0"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {!data.isOwnerPractice && data.assigned && (
        <button
          type="button"
          data-testid="firm-group-leave"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('Leave this firm group? Your practice data is unaffected.')) return;
            void run(() => apiClient.leaveFirmGroup(), 'Left firm group');
          }}
          className="btn-secondary text-sm inline-flex items-center gap-2 text-amber-700 border-amber-200 dark:border-amber-800"
        >
          <ArrowRightOnRectangleIcon className="h-4 w-4" />
          Leave firm group
        </button>
      )}
    </div>
  );
}
