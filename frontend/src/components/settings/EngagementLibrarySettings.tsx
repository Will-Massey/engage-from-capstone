import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import {
  BookOpenIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface LibraryVersion {
  id: string;
  versionLabel: string;
  publishedAt: string;
  changelog: string;
  clauseCount?: number;
}

interface TemplateNeedingUpdate {
  id: string;
  name: string;
  updatedAt: string;
  engagementLibraryVersion?: { versionLabel: string } | null;
}

export default function EngagementLibrarySettings() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const [current, setCurrent] = useState<LibraryVersion | null>(null);
  const [versions, setVersions] = useState<LibraryVersion[]>([]);
  const [proposalTemplates, setProposalTemplates] = useState<TemplateNeedingUpdate[]>([]);
  const [coverLetterTemplates, setCoverLetterTemplates] = useState<TemplateNeedingUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishForm, setPublishForm] = useState({ versionLabel: '', changelog: '' });

  const load = async () => {
    setLoading(true);
    try {
      const [currentRes, versionsRes, statusRes] = await Promise.all([
        apiClient.getEngagementLibraryCurrent(),
        apiClient.getEngagementLibraryVersions(),
        apiClient.getEngagementLibraryTemplatesNeedingUpdate(),
      ]);

      setCurrent((currentRes as any).data || null);
      setVersions((versionsRes as any).data || []);
      const status = (statusRes as any).data || {};
      setProposalTemplates(status.proposalTemplates || []);
      setCoverLetterTemplates(status.coverLetterTemplates || []);
    } catch {
      toast.error('Failed to load engagement library status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handlePublish = async () => {
    if (!publishForm.versionLabel.trim()) {
      toast.error('Enter a version label (e.g. 2026.2)');
      return;
    }

    setPublishing(true);
    try {
      const res = (await apiClient.publishEngagementLibraryVersion({
        versionLabel: publishForm.versionLabel.trim(),
        changelog: publishForm.changelog.trim() || undefined,
      })) as any;

      const flagged =
        (res.data?.proposalTemplatesFlagged || 0) +
        (res.data?.coverLetterTemplatesFlagged || 0);

      toast.success(
        `Published ${res.data?.version?.versionLabel}. ${flagged} template(s) flagged for review.`
      );
      setPublishForm({ versionLabel: '', changelog: '' });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Failed to publish library version');
    } finally {
      setPublishing(false);
    }
  };

  const totalNeedingUpdate = proposalTemplates.length + coverLetterTemplates.length;

  return (
    <div className="glass-tile overflow-hidden">
      <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
        <div className="flex items-start gap-3">
          <BookOpenIcon className="h-6 w-6 text-primary-600 dark:text-primary-400 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Engagement library
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              Versioned firm-approved clauses used when Clara assembles engagement letters
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-300">Loading library status…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white/50 dark:bg-slate-900/40">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Current version
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                  {current?.versionLabel || '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  {current?.clauseCount ?? '—'} clauses · published{' '}
                  {current?.publishedAt
                    ? new Date(current.publishedAt).toLocaleDateString('en-GB')
                    : '—'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white/50 dark:bg-slate-900/40">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Templates needing update
                </p>
                <p
                  className={`mt-1 text-2xl font-bold ${
                    totalNeedingUpdate > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {totalNeedingUpdate}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  Review after a new library version is published
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white/50 dark:bg-slate-900/40">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Version history
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                  {versions.length}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300 line-clamp-2">
                  {current?.changelog || 'No changelog recorded'}
                </p>
              </div>
            </div>

            {totalNeedingUpdate > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/20 p-4">
                <div className="flex items-start gap-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      {totalNeedingUpdate} template{totalNeedingUpdate === 1 ? '' : 's'} may be
                      out of date with the current engagement library
                    </p>

                    {proposalTemplates.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">
                          Proposal templates
                        </p>
                        <ul className="space-y-1">
                          {proposalTemplates.map((t) => (
                            <li key={t.id}>
                              <Link
                                to="/templates/proposals"
                                className="text-sm text-amber-900 dark:text-amber-100 underline hover:no-underline"
                              >
                                {t.name}
                              </Link>
                              {t.engagementLibraryVersion?.versionLabel && (
                                <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                                  pinned {t.engagementLibraryVersion.versionLabel}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {coverLetterTemplates.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">
                          Cover letter templates
                        </p>
                        <ul className="space-y-1">
                          {coverLetterTemplates.map((t) => (
                            <li key={t.id} className="text-sm text-amber-900 dark:text-amber-100">
                              {t.name}
                              {t.engagementLibraryVersion?.versionLabel && (
                                <span className="ml-2 text-xs text-amber-700 dark:text-amber-300">
                                  pinned {t.engagementLibraryVersion.versionLabel}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <ArrowPathIcon className="h-5 w-5 text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Publish new library version
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-300">
                  Snapshots the current <code>engagementClauseLibrary.ts</code> content and flags
                  affected proposal and cover letter templates. Use after deploying updated clauses.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                      Version label
                    </label>
                    <input
                      type="text"
                      placeholder="2026.2"
                      value={publishForm.versionLabel}
                      onChange={(e) =>
                        setPublishForm((f) => ({ ...f, versionLabel: e.target.value }))
                      }
                      className="mt-1 input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                      Changelog
                    </label>
                    <input
                      type="text"
                      placeholder="Updated MTD VAT clause wording"
                      value={publishForm.changelog}
                      onChange={(e) =>
                        setPublishForm((f) => ({ ...f, changelog: e.target.value }))
                      }
                      className="mt-1 input-field w-full"
                    />
                  </div>
                </div>
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="btn-primary text-sm"
                >
                  {publishing ? 'Publishing…' : 'Publish version'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}