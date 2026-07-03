import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  RocketLaunchIcon,
  RectangleStackIcon,
  ClockIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import { SkeletonCard } from '../../components/skeleton/SkeletonCard';
import ProposalTemplateEditor, {
  type ProposalTemplateEditorValues,
} from '../../components/templates/ProposalTemplateEditor';
import { AI_COPILOT } from '../../config/aiCopilot';

type TemplateFilter = 'all' | 'library' | 'custom';

interface ProposalTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  title: string;
  serviceCount: number;
  usageCount?: number | null;
  lastUsedAt?: string | null;
  updatedAt: string;
  isLibraryTemplate?: boolean;
}

interface TemplatesMeta {
  expectedLibraryCount: number;
  totalActive: number;
  libraryActive?: number;
  customActive?: number;
  catalogueActive?: number;
  libraryComplete?: boolean;
}

export default function ProposalTemplates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ProposalTemplateSummary[]>([]);
  const [meta, setMeta] = useState<TemplatesMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TemplateFilter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorInitial, setEditorInitial] = useState<Partial<ProposalTemplateEditorValues>>();

  const loadTemplates = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const res = (await apiClient.getProposalTemplates()) as any;
      if (res.success) {
        setTemplates(res.data || []);
        setMeta(res.meta || null);
      }
    } catch {
      if (!opts?.silent) toast.error('Failed to load templates');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const libraryCount = useMemo(
    () => templates.filter((t) => t.isLibraryTemplate).length,
    [templates]
  );
  const customCount = useMemo(
    () => templates.filter((t) => !t.isLibraryTemplate).length,
    [templates]
  );

  // Library seeds on first GET — poll until Engage catalogue + templates are complete
  useEffect(() => {
    const expected = meta?.expectedLibraryCount ?? 0;
    const activeLibrary = meta?.libraryActive ?? libraryCount;
    const libraryReady =
      meta?.libraryComplete === true || (expected > 0 && activeLibrary >= expected);
    if (loading || !meta || libraryReady) return;

    const timer = window.setInterval(() => {
      void loadTemplates({ silent: true });
    }, 4000);

    return () => window.clearInterval(timer);
  }, [loading, meta, libraryCount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (filter === 'library' && !t.isLibraryTemplate) return false;
      if (filter === 'custom' && t.isLibraryTemplate) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    });
  }, [templates, search, filter]);

  const openCreate = () => {
    setEditorMode('create');
    setEditingId(null);
    setEditorInitial(undefined);
    setEditorOpen(true);
  };

  const openEdit = async (id: string) => {
    try {
      const res = (await apiClient.getProposalTemplate(id)) as any;
      if (!res.success) {
        toast.error('Could not load template');
        return;
      }
      const t = res.data;
      setEditorMode('edit');
      setEditingId(id);
      setEditorInitial({
        name: t.name,
        description: t.description || '',
        title: t.title,
        coverLetter: t.coverLetter || '',
        serviceConfig: (t.serviceConfig || []).map((l: any) => ({
          serviceId: l.serviceId,
          name: l.name || 'Service',
          billingFrequency: l.billingFrequency || 'MONTHLY',
          displayPrice: l.displayPrice ?? 0,
          quantity: l.quantity ?? 1,
          discountPercent: l.discountPercent ?? 0,
        })),
      });
      setEditorOpen(true);
    } catch {
      toast.error('Failed to load template');
    }
  };

  const handleDelete = async (template: ProposalTemplateSummary) => {
    if (template.isLibraryTemplate) {
      toast.error('Engage library templates cannot be deleted — create your own copy instead.');
      return;
    }
    if (
      !confirm(
        `Delete template "${template.name}"? Existing proposals are not affected — only this reusable bundle.`
      )
    ) {
      return;
    }
    try {
      await apiClient.deleteProposalTemplate(template.id);
      toast.success('Template deleted');
      void loadTemplates();
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const useTemplate = (id: string) => {
    navigate(`/proposals/new?template=${id}`);
  };

  const seedingLibrary =
    loading ||
    (meta != null &&
      meta.expectedLibraryCount > 0 &&
      libraryCount < meta.expectedLibraryCount);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <RectangleStackIcon className="h-7 w-7 text-emerald-600" />
            Proposal templates
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
            The Engage library gives you ready-made ICAEW and ACCA service bundles. Add your own
            templates alongside them — nothing is replaced when you create something custom.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary inline-flex items-center gap-2">
          <PlusIcon className="h-4 w-4" />
          New custom template
        </button>
      </div>

      {!loading && meta && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
            <BookOpenIcon className="h-3.5 w-3.5" />
            {libraryCount} Engage library
          </span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {customCount} your template{customCount === 1 ? '' : 's'}
          </span>
          {seedingLibrary && (
            <span className="text-amber-700 dark:text-amber-300 animate-pulse">
              Loading full Engage library…
              {meta.catalogueActive != null && meta.catalogueActive < 20
                ? ' (importing services catalogue first)'
                : ''}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800"
          />
        </div>
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-sm shrink-0">
          {(
            [
              ['all', `All (${templates.length})`],
              ['library', `Engage library (${libraryCount})`],
              ['custom', `Yours (${customCount})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-3 py-2 transition-colors ${
                filter === key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Link to="/services" className="btn-secondary text-sm text-center">
          Manage services catalogue
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
            Preparing your Engage template library…
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center max-w-lg mx-auto">
          <RectangleStackIcon className="mx-auto h-14 w-14 text-slate-300 dark:text-slate-600 mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            {search ? 'No templates match your search' : filter === 'custom' ? 'No custom templates yet' : 'No templates yet'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            {search
              ? 'Try a different search term or filter.'
              : filter === 'custom'
                ? `Create a template here, or finish a proposal and let ${AI_COPILOT.name} offer to save it as one. Your custom templates sit alongside the full Engage library.`
                : `Create a custom template, or visit again in a moment while the Engage library finishes loading.`}
          </p>
          {(!search || filter === 'custom') && (
            <button type="button" onClick={openCreate} className="btn-primary inline-flex items-center gap-2">
              <PlusIcon className="h-4 w-4" />
              Create a custom template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => (
            <article
              key={template.id}
              className="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow border border-slate-200/80 dark:border-slate-700"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white flex-1 min-w-0">
                    {template.name}
                  </h3>
                  {template.isLibraryTemplate ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 shrink-0">
                      Engage library
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 shrink-0">
                      Your template
                    </span>
                  )}
                </div>
                {template.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                    {template.description}
                  </p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                  Default title: <span className="text-slate-700 dark:text-slate-300">{template.title}</span>
                </p>
                <div className="flex flex-wrap gap-2 mt-3 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                    {template.serviceCount} service{template.serviceCount === 1 ? '' : 's'}
                  </span>
                  {(template.usageCount ?? 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      Used {template.usageCount}×
                    </span>
                  )}
                </div>
                {template.lastUsedAt && (
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                    <ClockIcon className="h-3.5 w-3.5" />
                    Last used {formatDistanceToNow(new Date(template.lastUsedAt), { addSuffix: true })}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => useTemplate(template.id)}
                  className="btn-primary text-xs flex-1 inline-flex items-center justify-center gap-1"
                >
                  <RocketLaunchIcon className="h-4 w-4" />
                  Use template
                </button>
                <button
                  type="button"
                  onClick={() => void openEdit(template.id)}
                  className="btn-secondary text-xs p-2"
                  aria-label="Edit template"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                {!template.isLibraryTemplate && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(template)}
                    className="btn-secondary text-xs p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    aria-label="Delete template"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ProposalTemplateEditor
        open={editorOpen}
        mode={editorMode}
        templateId={editingId || undefined}
        initialValues={editorInitial}
        onClose={() => setEditorOpen(false)}
        onSaved={() => void loadTemplates()}
      />
    </div>
  );
}