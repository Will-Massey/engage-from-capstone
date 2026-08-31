import { useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import type { CreatePricingRulePayload, PricingRuleRecord } from '../../types/services';
import {
  formatAdjustment,
  formatConditionValue,
  PRICING_FORMULA_PRESETS,
} from './pricingFormulaPresets';

interface ServicePricingFormulasProps {
  serviceId: string;
  rules: PricingRuleRecord[];
  onChanged: () => Promise<void> | void;
}

const emptyRule = (): CreatePricingRulePayload => ({
  name: '',
  conditionField: 'turnover',
  conditionOperator: 'GTE',
  conditionValue: 250_000,
  adjustmentType: 'PERCENTAGE',
  adjustmentValue: 10,
  priority: 0,
});

export default function ServicePricingFormulas({
  serviceId,
  rules,
  onChanged,
}: ServicePricingFormulasProps) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<CreatePricingRulePayload>(emptyRule());
  const [busy, setBusy] = useState(false);

  const saveRule = async (payload: CreatePricingRulePayload) => {
    setBusy(true);
    try {
      await apiClient.createServicePricingRule(serviceId, payload);
      toast.success('Formula saved');
      setDraft(emptyRule());
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save formula');
    } finally {
      setBusy(false);
    }
  };

  const removeRule = async (ruleId: string) => {
    setBusy(true);
    try {
      await apiClient.deleteServicePricingRule(serviceId, ruleId);
      toast.success('Formula removed');
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove formula');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 shadow-sm p-6"
      data-testid="service-pricing-formulas"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Catalogue formulas</h2>
          <p className="text-sm text-slate-600 mt-1">
            Adjust the catalogue price from client turnover or staff count. The proposal builder can
            apply these with one click.
          </p>
        </div>
        <span className="text-sm text-primary-600">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {rules.length === 0 ? (
            <p className="text-sm text-slate-500">
              No formulas yet. Add a preset or write your own.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {rules.map((rule) => (
                <li key={rule.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{rule.name}</p>
                    <p className="text-xs text-slate-500">
                      If {rule.conditionField} {rule.conditionOperator}{' '}
                      {formatConditionValue(rule.conditionValue)} →{' '}
                      {formatAdjustment(rule.adjustmentType, rule.adjustmentValue)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary text-xs inline-flex items-center gap-1"
                    disabled={busy}
                    onClick={() => void removeRule(rule.id)}
                    aria-label={`Remove ${rule.name}`}
                  >
                    <TrashIcon className="h-4 w-4" />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {PRICING_FORMULA_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                disabled={busy}
                className="btn-secondary text-xs"
                onClick={() => void saveRule(preset)}
              >
                Add: {preset.name}
              </button>
            ))}
          </div>

          <form
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.name.trim()) {
                toast.error('Give the formula a name');
                return;
              }
              void saveRule({
                ...draft,
                name: draft.name.trim(),
                conditionValue: Number(draft.conditionValue),
                adjustmentValue: Number(draft.adjustmentValue),
              });
            }}
          >
            <label className="text-sm sm:col-span-2">
              <span className="block text-slate-600 mb-1">Name</span>
              <input
                className="input w-full"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Mid-market uplift"
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">When</span>
              <select
                className="input w-full"
                value={draft.conditionField}
                onChange={(e) => setDraft({ ...draft, conditionField: e.target.value })}
              >
                <option value="turnover">Annual turnover</option>
                <option value="employeeCount">Employee count</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Operator</span>
              <select
                className="input w-full"
                value={draft.conditionOperator}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    conditionOperator: e.target
                      .value as CreatePricingRulePayload['conditionOperator'],
                  })
                }
              >
                <option value="GTE">is at least</option>
                <option value="GT">is greater than</option>
                <option value="EQ">equals</option>
                <option value="LTE">is at most</option>
                <option value="LT">is less than</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Threshold</span>
              <input
                type="number"
                className="input w-full"
                value={Number(draft.conditionValue) || 0}
                onChange={(e) => setDraft({ ...draft, conditionValue: Number(e.target.value) })}
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 mb-1">Adjustment</span>
              <div className="flex gap-2">
                <select
                  className="input flex-1"
                  value={draft.adjustmentType}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      adjustmentType: e.target.value as CreatePricingRulePayload['adjustmentType'],
                    })
                  }
                >
                  <option value="PERCENTAGE">Percent</option>
                  <option value="FIXED">Fixed £</option>
                  <option value="PER_EMPLOYEE">£ per employee</option>
                </select>
                <input
                  type="number"
                  className="input w-24"
                  value={draft.adjustmentValue}
                  onChange={(e) => setDraft({ ...draft, adjustmentValue: Number(e.target.value) })}
                />
              </div>
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="btn-primary text-sm inline-flex items-center gap-1.5"
                disabled={busy}
              >
                <PlusIcon className="h-4 w-4" />
                {busy ? 'Saving…' : 'Save formula'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
