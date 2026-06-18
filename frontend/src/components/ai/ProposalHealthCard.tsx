import { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import { AiPanel, showAiError } from './AiPanel';
import { AI_COPILOT } from '../../config/aiCopilot';

interface ProposalHealthCardProps {
  proposalId: string;
}

export default function ProposalHealthCard({ proposalId }: ProposalHealthCardProps) {
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [health, setHealth] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const status = (await apiClient.getAiStatus()) as any;
      setConfigured(status.data?.configured ?? false);
      if (!status.data?.configured) return;

      const res = (await apiClient.getProposalHealth(proposalId)) as any;
      if (res.success) setHealth(res.data);
    } catch (e) {
      showAiError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId]);

  const scoreColor =
    !health ? 'text-slate-500' : health.healthScore >= 75 ? 'text-green-600' : health.healthScore >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <AiPanel
      title="Proposal health"
      description={`${AI_COPILOT.name}'s analysis of engagement progress and recommended next steps`}
      configured={configured}
      loading={loading}
      onAction={load}
      actionLabel="Refresh"
    >
      {health && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{health.healthScore}</span>
            <span className="text-xs text-slate-500">/ 100 health score</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200">{health.summary}</p>
          {health.recommendedActions?.length > 0 && (
            <ul className="text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
              {health.recommendedActions.map((a: string, i: number) => (
                <li key={i} className="flex gap-2">
                  <span className="text-violet-500">→</span>
                  {a}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </AiPanel>
  );
}
