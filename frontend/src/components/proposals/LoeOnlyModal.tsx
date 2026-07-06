import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';

interface ServiceOption {
  id: string;
  name: string;
  category?: string;
}

interface LoeOnlyModalProps {
  clientId: string;
  clientName: string;
  onClose: () => void;
}

export default function LoeOnlyModal({ clientId, clientName, onClose }: LoeOnlyModalProps) {
  const navigate = useNavigate();
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [title, setTitle] = useState(`Letter of engagement — ${clientName}`);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = (await apiClient.getServices({ isActive: true })) as any;
        const list = (res.data || res || []) as ServiceOption[];
        setServices(Array.isArray(list) ? list : []);
      } catch {
        toast.error('Failed to load services catalogue');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggleService = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!selectedIds.length) {
      toast.error('Select at least one service to define scope');
      return;
    }

    setSubmitting(true);
    try {
      const res = (await apiClient.createLoeOnlyProposal({
        clientId,
        serviceIds: selectedIds,
        title: title.trim() || undefined,
      })) as any;

      const proposalId = res?.data?.id;
      toast.success('Engagement letter draft created — no pricing attached');
      onClose();
      if (proposalId) {
        navigate(`/proposals/${proposalId}`);
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to create engagement letter');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <DocumentTextIcon className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Send engagement letter only
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Create a letter of engagement for <strong>{clientName}</strong> without a fee schedule.
            Select services to drive clause selection from your firm&apos;s library.
          </p>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100 mb-2">
              Services in scope
            </label>
            {loading ? (
              <p className="text-sm text-slate-500">Loading catalogue…</p>
            ) : services.length === 0 ? (
              <p className="text-sm text-amber-600">No active services in your catalogue.</p>
            ) : (
              <ul className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                {services.map((svc) => (
                  <li key={svc.id}>
                    <label className="flex items-start gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(svc.id)}
                        onChange={() => toggleService(svc.id)}
                        className="mt-0.5 rounded border-slate-300"
                      />
                      <span className="text-slate-800 dark:text-slate-100">{svc.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedIds.length}
            className="btn-primary text-sm"
          >
            {submitting ? 'Creating…' : 'Create engagement letter'}
          </button>
        </div>
      </div>
    </div>
  );
}
