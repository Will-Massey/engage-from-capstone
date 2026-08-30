import { useState } from 'react';
import toast from 'react-hot-toast';
import ComingSoonCallout from '../../components/ui/ComingSoonCallout';
import { apiClient } from '../../utils/api';
import {
  HMRC_64_8_STAGE_LABELS,
  HMRC_64_8_STAGES,
  readHmrc648Track,
  type Hmrc648Stage,
} from './letterTrack';

type Props = {
  letterId: string;
  metaJson?: string | null;
  onUpdated: (letter: { metaJson?: string | null }) => void;
};

export default function Hmrc648Track({ letterId, metaJson, onUpdated }: Props) {
  const track = readHmrc648Track(metaJson);
  const current = track?.stage || 'PACK_DRAFT';
  const [busy, setBusy] = useState(false);

  async function setStage(stage: Hmrc648Stage) {
    setBusy(true);
    try {
      const res = await apiClient.patch(`/practice-letters/${letterId}/track`, { stage });
      const letter = res.data?.data ?? res.data;
      onUpdated(letter);
      toast.success(`64-8 marked ${HMRC_64_8_STAGE_LABELS[stage]}`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } };
      toast.error(err.response?.data?.error?.message || 'Could not update the 64-8 track');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="hmrc-64-8-track">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          64-8 status track
        </p>
        <ol className="mt-2 grid gap-1 sm:grid-cols-5">
          {HMRC_64_8_STAGES.map((stage) => {
            const active = stage === current;
            const reached =
              HMRC_64_8_STAGES.indexOf(stage) <= HMRC_64_8_STAGES.indexOf(current);
            return (
              <li key={stage}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setStage(stage)}
                  className={`w-full rounded-lg border px-2 py-2 text-left text-2xs font-medium ${
                    active
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
                      : reached
                        ? 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        : 'border-dashed border-slate-200 text-slate-400 dark:border-slate-700'
                  }`}
                >
                  {HMRC_64_8_STAGE_LABELS[stage]}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <ComingSoonCallout
        title="Live HMRC agent authorisation"
        testId="hmrc-64-8-api-soon"
      >
        HMRC does not offer a public 64-8 or Agent Services API we can call. Track the pack here
        until a partner gateway exists — do not pretend a submission went through.
      </ComingSoonCallout>
    </div>
  );
}
