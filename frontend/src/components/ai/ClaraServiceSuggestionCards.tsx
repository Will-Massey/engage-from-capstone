import { useState } from 'react';
import { CheckIcon, XMarkIcon, PencilIcon } from '@heroicons/react/24/outline';
import { BILLING_CADENCE_OPTIONS, parseFrequencyOptions, type BillingCadence } from '../../utils/billingCadence';

export interface ClaraServiceSuggestion {
  serviceId: string;
  name: string;
  billingFrequency: string;
  displayPrice: number;
  rationale: string;
  frequencyOptions?: string;
}

interface ClaraServiceSuggestionCardsProps {
  suggestions: ClaraServiceSuggestion[];
  onAccept: (suggestion: ClaraServiceSuggestion) => void;
  onTweak: (
    suggestion: ClaraServiceSuggestion,
    tweaks: { billingFrequency: string; displayPrice: number }
  ) => void;
  onReject: (serviceId: string) => void;
  onAcceptAll?: () => void;
  emptyMessage?: string;
  className?: string;
}

function formatPrice(value: number): string {
  return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function cadenceLabel(freq: string): string {
  return (
    BILLING_CADENCE_OPTIONS.find((o) => o.value === freq)?.label ??
    freq.replace(/_/g, ' ').toLowerCase()
  );
}

export default function ClaraServiceSuggestionCards({
  suggestions,
  onAccept,
  onTweak,
  onReject,
  onAcceptAll,
  emptyMessage = 'All service suggestions handled.',
  className = '',
}: ClaraServiceSuggestionCardsProps) {
  const [tweakingId, setTweakingId] = useState<string | null>(null);
  const [tweakPrice, setTweakPrice] = useState('');
  const [tweakCadence, setTweakCadence] = useState<BillingCadence>('MONTHLY');

  const startTweak = (s: ClaraServiceSuggestion) => {
    setTweakingId(s.serviceId);
    setTweakPrice(String(s.displayPrice));
    const allowed = parseFrequencyOptions(s.frequencyOptions);
    const initial = (allowed.includes(s.billingFrequency as BillingCadence)
      ? s.billingFrequency
      : allowed[0]) as BillingCadence;
    setTweakCadence(initial);
  };

  const cancelTweak = () => {
    setTweakingId(null);
    setTweakPrice('');
  };

  const applyTweak = (s: ClaraServiceSuggestion) => {
    const price = parseFloat(tweakPrice);
    if (!Number.isFinite(price) || price < 0) return;
    onTweak(s, { billingFrequency: tweakCadence, displayPrice: price });
    cancelTweak();
  };

  if (suggestions.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">{emptyMessage}</p>;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <ul className="text-xs space-y-2">
        {suggestions.map((s) => {
          const isTweaking = tweakingId === s.serviceId;
          const allowedCadences = parseFrequencyOptions(s.frequencyOptions);

          return (
            <li
              key={s.serviceId}
              className="rounded-xl border border-violet-100 dark:border-violet-900/50 bg-white/70 dark:bg-slate-900/50 p-3 text-slate-600 dark:text-slate-300"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{s.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {formatPrice(s.displayPrice)} · {cadenceLabel(s.billingFrequency)}
                  </p>
                  <p className="mt-1.5 text-slate-600 dark:text-slate-300">{s.rationale}</p>
                </div>
              </div>

              {isTweaking ? (
                <div className="mt-3 pt-3 border-t border-violet-100 dark:border-violet-900/40 space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-violet-600 dark:text-violet-400 font-medium">
                    Tweak before adding
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
                      Fee (£)
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={tweakPrice}
                        onChange={(e) => setTweakPrice(e.target.value)}
                        className="input-field text-xs py-1.5 w-28"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-500">
                      Billing
                      <select
                        value={tweakCadence}
                        onChange={(e) => setTweakCadence(e.target.value as BillingCadence)}
                        className="input-field text-xs py-1.5 w-32"
                      >
                        {allowedCadences.map((c) => (
                          <option key={c} value={c}>
                            {cadenceLabel(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyTweak(s)}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-violet-600 text-white hover:bg-violet-700 inline-flex items-center gap-1"
                    >
                      <CheckIcon className="h-3 w-3" />
                      Apply tweak
                    </button>
                    <button
                      type="button"
                      onClick={cancelTweak}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <button
                    type="button"
                    onClick={() => onAccept(s)}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800/50 inline-flex items-center gap-1"
                  >
                    <CheckIcon className="h-3 w-3" />
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => startTweak(s)}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 inline-flex items-center gap-1"
                  >
                    <PencilIcon className="h-3 w-3" />
                    Tweak
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(s.serviceId)}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/60 inline-flex items-center gap-1"
                  >
                    <XMarkIcon className="h-3 w-3" />
                    Reject
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {onAcceptAll && suggestions.length > 1 && (
        <button type="button" onClick={onAcceptAll} className="btn-primary text-xs py-1.5 px-3 mt-1">
          Accept all remaining
        </button>
      )}
    </div>
  );
}