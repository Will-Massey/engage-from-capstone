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
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import { SkeletonCard } from '../../components/skeleton/SkeletonCard';
import ProposalTemplateEditor, {
  type ProposalTemplateEditorValues,
} from '../../components/templates/ProposalTemplateEditor';
import { AI_COPILOT } from '../../config/aiCopilot';

interface ProposalTemplateSummary {
  id: string;
  name: string;
  description?: string | null;
  title: string;
  serviceCount: number;
  usageCount?: number | null;
  lastUsedAt?: string | null;
  updatedAt: string;
}

export default function ProposalTemplates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ProposalTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorInitial, setEditorInitial] = useState<Partial<ProposalTemplateEditorValues>>();

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = (await apiClient.getProposalTemplates()) as any;
      if (res.success) setTemplates(res.data || []);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
    );
  }, [templates, search]);

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <RectangleStackIcon className="h-7 w-7 text-emerald-600" />
            Proposal templates
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
            Pre-make service bundles with fixed fees and cover letters. Start a proposal in seconds
            instead of building from scratch each time.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary inline-flex items-center gap-2">
          <PlusIcon className="h-4 w-4" />
          New template
        </button>
      </div>

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
        <Link to="/services" className="btn-secondary text-sm text-center">
          Manage services catalogue
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center max-w-lg mx-auto">
          <RectangleStackIcon className="mx-auto h-14 w-14 text-slate-300 dark:text-slate-600 mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            {search ? 'No templates match your search' : 'No templates yet'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            {search
              ? 'Try a different search term.'
              : `Create a template here, or finish a proposal manually and let ${AI_COPILOT.name} offer to save it as one.`}
          </p>
          {!search && (
            <button type="button" onClick={openCreate} className="btn-primary inline-flex items-center gap-2">
              <PlusIcon className="h-4 w-4" />
              Create your first template
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
                <h3 className="font-semibold text-slate-900 dark:text-white">{template.name}</h3>
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
                <button
                  type="button"
                  onClick={() => void handleDelete(template)}
                  className="btn-secondary text-xs p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  aria-label="Delete template"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
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