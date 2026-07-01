import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import { AiPanel, AiDraftPreview, showAiError } from './AiPanel';
import ProposalHealthCard from './ProposalHealthCard';
import { AI_COPILOT } from '../../config/aiCopilot';

interface ProposalAiAssistProps {
  proposal: {
    id: string;
    status: string;
    clientId?: string;
    engagementLetter?: string | null;
  };
  onUpdated?: () => void;
}

export default function ProposalAiAssist({ proposal, onUpdated }: ProposalAiAssistProps) {
  const navigate = useNavigate();
  const [configured, setConfigured] = useState(true);

  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState<{ subject: string; body: string } | null>(null);
  const [followUpTone, setFollowUpTone] = useState<'professional' | 'friendly' | 'urgent'>('professional');

  const [engagementLoading, setEngagementLoading] = useState(false);
  const [engagementDraft, setEngagementDraft] = useState<string | null>(null);
  const [engagementIncludeAiIntro, setEngagementIncludeAiIntro] = useState(false);

  const [renewalLoading, setRenewalLoading] = useState(false);
  const [renewalDraft, setRenewalDraft] = useState<any>(null);
  const [upliftPercent, setUpliftPercent] = useState(0);

  useEffect(() => {
    apiClient
      .getAiStatus()
      .then((res: any) => setConfigured(res.data?.configured ?? false))
      .catch(() => setConfigured(false));
  }, []);

  const generateFollowUp = async () => {
    setFollowUpLoading(true);
    try {
      const res = (await apiClient.aiFollowUp(proposal.id, followUpTone)) as any;
      if (res.success) {
        setFollowUpDraft({ subject: res.data.subject, body: res.data.body });
      }
    } catch (e) {
      showAiError(e);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const copyFollowUp = async () => {
    if (!followUpDraft) return;
    const text = `Subject: ${followUpDraft.subject}\n\n${followUpDraft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Follow-up copied — paste into your email client');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const generateEngagementLetter = async (includeAiIntro = engagementIncludeAiIntro) => {
    setEngagementLoading(true);
    setEngagementDraft('');
    try {
      const streamer = (apiClient as any).aiStreamEngagementLetter;
      if (typeof streamer === 'function') {
        let accumulated = '';
        await streamer(
          proposal.id,
          (chunk: string) => {
            accumulated += chunk;
            setEngagementDraft(accumulated);
          },
          { includeAiIntro }
        );
      } else {
        const res = (await apiClient.aiEngagementLetter(proposal.id, { includeAiIntro })) as any;
        if (res.success) setEngagementDraft(res.data.content);
      }
    } catch (e) {
      showAiError(e);
      setEngagementDraft(null);
    } finally {
      setEngagementLoading(false);
    }
  };

  const saveEngagementLetter = async () => {
    if (!engagementDraft) return;
    try {
      const res = (await apiClient.updateProposal(proposal.id, {
        engagementLetter: engagementDraft,
      })) as any;
      if (res.success === false) {
        toast.error(res.error?.message || 'Could not save engagement letter');
        return;
      }
      toast.success('Engagement letter saved to proposal');
      setEngagementDraft(null);
      onUpdated?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || 'Could not save engagement letter');
    }
  };

  const generateRenewal = async () => {
    if (proposal.status !== 'ACCEPTED') {
      toast.error('Renewals can only be drafted from accepted proposals');
      return;
    }
    setRenewalLoading(true);
    try {
      const res = (await apiClient.aiRenewalDraft(proposal.id, upliftPercent)) as any;
      if (res.success) setRenewalDraft(res.data);
    } catch (e) {
      showAiError(e);
    } finally {
      setRenewalLoading(false);
    }
  };

  const createRenewalProposal = async () => {
    if (!renewalDraft) return;
    setRenewalLoading(true);
    try {
      const res = (await apiClient.createProposal({
        clientId: renewalDraft.clientId,
        title: renewalDraft.title,
        services: renewalDraft.services,
        validUntil: renewalDraft.validUntil,
        coverLetter: renewalDraft.coverLetter,
      })) as any;
      if (res.success && res.data?.id) {
        toast.success('Renewal proposal created — review before sending');
        setRenewalDraft(null);
        navigate(`/proposals/${res.data.id}`);
      } else {
        toast.error(res.error?.message || 'Failed to create renewal proposal');
      }
    } catch (e: any) {
      showAiError(e);
    } finally {
      setRenewalLoading(false);
    }
  };

  const showFollowUp =
    proposal.status === 'SENT' || proposal.status === 'VIEWED' || proposal.status === 'EXPIRED';
  const showRenewal = proposal.status === 'ACCEPTED';

  return (
    <div className="space-y-4 print:hidden">
      <ProposalHealthCard proposalId={proposal.id} />

      {showFollowUp && (
        <AiPanel
          title="Follow-up email"
          description="Draft a reminder for an unsigned proposal — you send it manually"
          configured={configured}
          loading={followUpLoading}
          onAction={generateFollowUp}
          actionLabel="Draft email"
        >
          <div className="flex gap-2 mb-2">
            {(['professional', 'friendly', 'urgent'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFollowUpTone(t)}
                className={`text-xs px-2 py-1 rounded-full capitalize ${
                  followUpTone === t
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {followUpDraft && (
            <div className="mt-2 space-y-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Subject: {followUpDraft.subject}
              </p>
              <AiDraftPreview
                content={followUpDraft.body}
                onApply={copyFollowUp}
                onDiscard={() => setFollowUpDraft(null)}
                applyLabel="Copy to clipboard"
              />
            </div>
          )}
        </AiPanel>
      )}

      <AiPanel
        title="Engagement letter"
        description="Assembled from your approved clause library — no AI unless you opt in below"
        configured={configured}
        loading={engagementLoading}
        onAction={() => generateEngagementLetter(false)}
        actionLabel={proposal.engagementLetter ? 'Reassemble clauses' : 'Assemble from clauses'}
      >
        <label className="flex items-start gap-2 mt-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={engagementIncludeAiIntro}
            onChange={(e) => setEngagementIncludeAiIntro(e.target.checked)}
            className="mt-0.5 rounded border-slate-300"
          />
          <span>
            Add a short introduction from {AI_COPILOT.name} (uses extra tokens — clause body stays from your library)
          </span>
        </label>
        {engagementIncludeAiIntro && (
          <button
            type="button"
            onClick={() => generateEngagementLetter(true)}
            disabled={engagementLoading}
            className="mt-2 text-xs px-2 py-1 rounded-lg border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
          >
            Assemble with {AI_COPILOT.name} introduction
          </button>
        )}
        {proposal.engagementLetter && !engagementDraft && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            A letter is already saved on this proposal.
          </p>
        )}
        {engagementDraft && (
          <AiDraftPreview
            content={engagementDraft}
            onApply={saveEngagementLetter}
            onDiscard={() => setEngagementDraft(null)}
            onRegenerate={() => generateEngagementLetter(engagementIncludeAiIntro)}
            applyLabel="Accept & save"
            isStreaming={engagementLoading}
          />
        )}
      </AiPanel>

      {showRenewal && (
        <AiPanel
          title="Renewal draft"
          description="Create next year's proposal — ask Clara for an uplift or reduction (e.g. 10% or -10%)"
          configured={configured}
          loading={renewalLoading}
          onAction={generateRenewal}
          actionLabel="Draft renewal"
        >
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <label className="text-xs text-slate-600 dark:text-slate-400">Fee adjustment %</label>
            <input
              type="number"
              min={-50}
              max={50}
              step={0.5}
              value={upliftPercent}
              onChange={(e) => {
                const v = Number(e.target.value);
                setUpliftPercent(Number.isFinite(v) ? Math.min(50, Math.max(-50, v)) : 0);
              }}
              className="w-20 px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Negative = reduction · 0 = unchanged
            </span>
          </div>
          {renewalDraft && (
            <div className="mt-2 space-y-2">
              {renewalDraft.renewalNarrative && (
                <p className="text-xs text-violet-600 dark:text-violet-400">{renewalDraft.renewalNarrative}</p>
              )}
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{renewalDraft.title}</p>
              <AiDraftPreview
                content={renewalDraft.coverLetter}
                onApply={createRenewalProposal}
                onDiscard={() => setRenewalDraft(null)}
                applyLabel="Create renewal proposal"
              />
            </div>
          )}
        </AiPanel>
      )}
    </div>
  );
}