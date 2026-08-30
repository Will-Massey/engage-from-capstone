import { formatCurrency } from '../../utils/formatters';
import {
  DEFAULT_WIZARD_CATCH_UP,
  isRecurringWizardFrequency,
  previewCatchUpNet,
  type WizardCatchUpDraft,
  type WizardCatchUpSource,
} from './wizardCatchUp';

type Props = {
  services: WizardCatchUpSource[];
  drafts: Record<string, WizardCatchUpDraft>;
  onChange: (serviceId: string, draft: WizardCatchUpDraft) => void;
};

export default function WizardCatchUpPanel({ services, drafts, onChange }: Props) {
  const recurring = services.filter((s) => isRecurringWizardFrequency(s.billingFrequency));
  if (recurring.length === 0) return null;

  return (
    <div
      className="space-y-3 rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3 dark:border-emerald-900 dark:bg-emerald-950/20"
      data-testid="wizard-catch-up"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">Catch-up fees</p>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
          If the client is behind on their books, add a one-off before the ongoing fee starts.
        </p>
      </div>
      {recurring.map((service) => {
        const draft = drafts[service.serviceId] || DEFAULT_WIZARD_CATCH_UP;
        const net = previewCatchUpNet(service, draft);
        return (
          <div
            key={service.serviceId}
            className="rounded-lg border border-slate-200 bg-white/80 p-3 dark:border-slate-700 dark:bg-slate-900/60"
          >
            <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.enabled}
                data-testid={`catch-up-toggle-${service.serviceId}`}
                onChange={(e) => onChange(service.serviceId, { ...draft, enabled: e.target.checked })}
              />
              <span>
                <span className="font-medium">{service.name}</span>
                <span className="block text-xs text-slate-500">
                  {formatCurrency(service.displayPrice)}{' '}
                  {service.billingFrequency.replace(/_/g, ' ').toLowerCase()}
                </span>
              </span>
            </label>
            {draft.enabled && (
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <label className="text-xs text-slate-500">
                  Months behind
                  <input
                    type="number"
                    min={1}
                    max={24}
                    className="input-field mt-1 w-20"
                    data-testid={`catch-up-months-${service.serviceId}`}
                    value={draft.months}
                    onChange={(e) =>
                      onChange(service.serviceId, {
                        ...draft,
                        months: Number(e.target.value) || 1,
                      })
                    }
                  />
                </label>
                <label className="text-xs text-slate-500">
                  Discount %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="input-field mt-1 w-20"
                    value={draft.discountPercent}
                    onChange={(e) =>
                      onChange(service.serviceId, {
                        ...draft,
                        discountPercent: Number(e.target.value) || 0,
                      })
                    }
                  />
                </label>
                {net != null && (
                  <p className="text-sm font-medium tabular-nums text-emerald-800 dark:text-emerald-200">
                    {formatCurrency(net)} one-off
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
