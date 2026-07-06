import { useEffect, useState } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';

export default function VoiceOfPracticeSettings() {
  const [sampleText, setSampleText] = useState('');
  const [styleHints, setStyleHints] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = (await apiClient.getVoiceOfPractice()) as any;
        if (res.success && res.data) {
          setStyleHints(res.data.styleHints || null);
          setUpdatedAt(res.data.updatedAt || null);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const save = async () => {
    if (sampleText.trim().length < 80) {
      toast.error('Paste at least 80 characters from a sample letter');
      return;
    }
    setSaving(true);
    try {
      const res = (await apiClient.saveVoiceOfPractice(sampleText)) as any;
      if (res.success) {
        setStyleHints(res.data.styleHints);
        setUpdatedAt(res.data.updatedAt);
        toast.success('Voice of practice saved — Clara will match your tone in cover letters');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save voice of practice');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <SparklesIcon className="h-6 w-6 text-violet-600 shrink-0" />
        <div>
          <h4 className="font-medium text-slate-900 dark:text-white">Voice of practice</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Upload a sample engagement or proposal letter. Clara extracts style hints and applies
            them when drafting cover letters for your practice.
          </p>
        </div>
      </div>

      <textarea
        value={sampleText}
        onChange={(e) => setSampleText(e.target.value)}
        rows={8}
        className="input-field w-full font-mono text-sm"
        placeholder="Paste a representative letter from your practice (minimum 80 characters)…"
      />

      <button type="button" onClick={save} disabled={saving} className="btn-primary">
        {saving ? 'Analysing…' : 'Save voice of practice'}
      </button>

      {styleHints && (
        <div className="rounded-xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/50 dark:bg-violet-950/20 p-4">
          <p className="text-xs font-medium text-violet-800 dark:text-violet-200 uppercase tracking-wide">
            Current style hints
          </p>
          <p className="text-sm text-slate-800 dark:text-slate-200 mt-2 whitespace-pre-wrap">
            {styleHints}
          </p>
          {updatedAt && (
            <p className="text-xs text-slate-500 mt-2">
              Updated {new Date(updatedAt).toLocaleString('en-GB')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
