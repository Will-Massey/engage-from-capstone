import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalculatorIcon,
  SparklesIcon,
  ArrowRightIcon,
  CurrencyPoundIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { formatServiceCategory } from '../../utils/serviceCategoryLabels';
import {
  savePricingSuggestion,
  type PricingCalculatorInputs,
  type SuggestedServiceFee,
} from '../../utils/pricingSuggestionStorage';
import toast from 'react-hot-toast';
import FeeBenchmarkWidget from '../analytics/FeeBenchmarkWidget';
import type { ServiceCategory, TurnoverBand } from '../../types/analytics';

/** Map calculator turnover options onto the benchmark bands (by band midpoint). */
const BENCHMARK_TURNOVER_BANDS: Record<string, TurnoverBand> = {
  UNDER_50K: 'MICRO',
  BAND_50K_100K: 'SMALL',
  BAND_100K_250K: 'SMALL',
  BAND_250K_500K: 'MEDIUM',
  BAND_500K_1M: 'MEDIUM',
  OVER_1M: 'LARGE',
};

const TURNOVER_OPTIONS = [
  { value: 'UNDER_50K', label: 'Under £50,000' },
  { value: 'BAND_50K_100K', label: '£50,000 – £99,999' },
  { value: 'BAND_100K_250K', label: '£100,000 – £249,999' },
  { value: 'BAND_250K_500K', label: '£250,000 – £499,999' },
  { value: 'BAND_500K_1M', label: '£500,000 – £999,999' },
  { value: 'OVER_1M', label: '£1,000,000+' },
];

const ENTITY_OPTIONS = [
  { value: 'LIMITED_COMPANY', label: 'Limited company' },
  { value: 'SOLE_TRADER', label: 'Sole trader' },
  { value: 'LLP', label: 'LLP' },
  { value: 'PARTNERSHIP', label: 'Partnership' },
];

const MTD_OPTIONS = [
  { value: 'NOT_APPLICABLE', label: 'Not applicable (Ltd / LLP)' },
  { value: 'NOT_REGISTERED', label: 'Not yet registered' },
  { value: 'REGISTERED', label: 'Registered for MTD ITSA' },
  { value: 'FULLY_COMPLIANT', label: 'Fully compliant' },
];

interface PricingResult {
  inputs: PricingCalculatorInputs;
  services: SuggestedServiceFee[];
  byCategory: Array<{
    category: string;
    label: string;
    monthlySuggested: number;
    monthlyLow: number;
    monthlyHigh: number;
  }>;
  totals: {
    monthlyLow: number;
    monthlyHigh: number;
    monthlySuggested: number;
    annualSuggested: number;
    currency: string;
  };
  formulaNotes: string[];
}

const defaultInputs: PricingCalculatorInputs = {
  turnoverBand: 'BAND_250K_500K',
  entityType: 'LIMITED_COMPANY',
  employeeCount: 0,
  vatRegistered: false,
  mtdStatus: 'NOT_APPLICABLE',
  complexity: { hasPayroll: false, hasRd: false, multiSite: false },
};

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function billingLabel(cycle: string): string {
  const map: Record<string, string> = {
    MONTHLY: 'month',
    QUARTERLY: 'quarter',
    ANNUALLY: 'year',
    ONE_TIME: 'one-off',
    WEEKLY: 'week',
  };
  return map[cycle] || cycle.toLowerCase();
}

interface PricingCalculatorProps {
  /** Compact mode for embedding in Services page */
  compact?: boolean;
}

export default function PricingCalculator({ compact = false }: PricingCalculatorProps) {
  const navigate = useNavigate();
  const [inputs, setInputs] = useState<PricingCalculatorInputs>(defaultInputs);
  const [result, setResult] = useState<PricingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);

  const calculate = useCallback(async () => {
    setLoading(true);
    setExplanation(null);
    try {
      const res = (await apiClient.pricingSuggestFees(inputs)) as any;
      if (res.success) {
        setResult(res.data);
      }
    } catch {
      toast.error('Could not calculate fees — please try again');
    } finally {
      setLoading(false);
    }
  }, [inputs]);

  const explainPricing = async () => {
    if (!result) return;
    setExplaining(true);
    try {
      const status = (await apiClient.getAiStatus()) as any;
      setAiConfigured(status.data?.configured ?? false);
      if (!status.data?.configured) {
        toast.error('Clara is not configured — explanation unavailable');
        return;
      }
      const res = (await apiClient.pricingExplain({
        suggestion: {
          inputs: result.inputs,
          services: result.services,
          totals: result.totals,
        },
      })) as any;
      if (res.success) {
        setExplanation(res.data.explanation);
      }
    } catch {
      toast.error('Could not get pricing explanation');
    } finally {
      setExplaining(false);
    }
  };

  const applyToProposal = () => {
    if (!result) return;
    const unmatched = result.services.filter((s) => !s.serviceTemplateId);
    if (unmatched.length > 0) {
      toast(
        `${unmatched.length} service(s) not in your catalogue — import from UK templates or add manually`,
        { icon: 'ℹ️', duration: 5000 }
      );
    }
    savePricingSuggestion({
      inputs: result.inputs,
      services: result.services,
      totals: result.totals,
    });
    navigate('/proposals/new?manual=1&fromPricing=1');
  };

  const showMtdOptions = inputs.entityType === 'SOLE_TRADER';

  // R3.2: benchmark the dominant suggested category fee against the market
  const benchmarkYourFee = useMemo(() => {
    if (!result || result.byCategory.length === 0) return undefined;
    const top = [...result.byCategory].sort((a, b) => b.monthlySuggested - a.monthlySuggested)[0];
    if (!(top.monthlySuggested > 0)) return undefined;
    return { fee: top.monthlySuggested, category: top.category as ServiceCategory };
  }, [result]);
  const benchmarkTurnoverBand =
    benchmarkYourFee && result
      ? (BENCHMARK_TURNOVER_BANDS[result.inputs.turnoverBand] ?? 'UNKNOWN')
      : undefined;

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      <FeeBenchmarkWidget compact yourFee={benchmarkYourFee} turnoverBand={benchmarkTurnoverBand} />
      {!compact && (
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
            <CalculatorIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Value-based pricing calculator
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Rule-based fee suggestions from turnover, entity type, and complexity — no AI unless
              you ask Clara to explain.
            </p>
          </div>
        </div>
      )}

      <div className={`grid gap-6 ${compact ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {/* Inputs */}
        <div className="glass-tile p-5 space-y-4">
          <h3 className="font-medium text-slate-900 dark:text-white">Client profile</h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Annual turnover band
            </label>
            <select
              value={inputs.turnoverBand}
              onChange={(e) => setInputs({ ...inputs, turnoverBand: e.target.value })}
              className="input-field w-full"
            >
              {TURNOVER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Entity type
              </label>
              <select
                value={inputs.entityType}
                onChange={(e) => {
                  const entityType = e.target.value;
                  setInputs({
                    ...inputs,
                    entityType,
                    mtdStatus: entityType === 'SOLE_TRADER' ? inputs.mtdStatus : 'NOT_APPLICABLE',
                  });
                }}
                className="input-field w-full"
              >
                {ENTITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Employees
              </label>
              <input
                type="number"
                min={0}
                max={500}
                value={inputs.employeeCount}
                onChange={(e) =>
                  setInputs({ ...inputs, employeeCount: parseInt(e.target.value, 10) || 0 })
                }
                className="input-field w-full"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={inputs.vatRegistered}
                onChange={(e) => setInputs({ ...inputs, vatRegistered: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-primary-600"
              />
              VAT registered
            </label>
          </div>

          {showMtdOptions && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                MTD ITSA status
              </label>
              <select
                value={inputs.mtdStatus}
                onChange={(e) => setInputs({ ...inputs, mtdStatus: e.target.value })}
                className="input-field w-full"
              >
                {MTD_OPTIONS.filter((o) => o.value !== 'NOT_APPLICABLE').map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <fieldset>
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Complexity flags
            </legend>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ['hasPayroll', 'Payroll'],
                  ['hasRd', 'R&D claims'],
                  ['multiSite', 'Multi-site'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={inputs.complexity[key]}
                    onChange={(e) =>
                      setInputs({
                        ...inputs,
                        complexity: { ...inputs.complexity, [key]: e.target.checked },
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-primary-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <button
            onClick={calculate}
            disabled={loading}
            className="btn-primary w-full inline-flex items-center justify-center gap-2"
          >
            <CalculatorIcon className="h-5 w-5" />
            {loading ? 'Calculating…' : 'Calculate suggested fees'}
          </button>
        </div>

        {/* Results */}
        <div className="glass-tile p-5 space-y-4">
          <h3 className="font-medium text-slate-900 dark:text-white">Suggested fee bands</h3>

          {!result ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <CurrencyPoundIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                Enter client details and calculate to see fee ranges per service.
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/40">
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  Estimated monthly total
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {formatGbp(result.totals.monthlyLow)} – {formatGbp(result.totals.monthlyHigh)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Midpoint {formatGbp(result.totals.monthlySuggested)}/month ·{' '}
                  {formatGbp(result.totals.annualSuggested)}/year
                </div>
              </div>

              {result.byCategory.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.byCategory.map((cat) => (
                    <span
                      key={cat.category}
                      className="px-2 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    >
                      {cat.label}: {formatGbp(cat.monthlySuggested)}/mo
                    </span>
                  ))}
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {result.services.map((svc) => (
                  <div
                    key={svc.catalogName}
                    className="flex items-start justify-between gap-3 p-3 rounded-lg bg-white/50 dark:bg-slate-800/40 border border-white/10"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm text-slate-900 dark:text-white truncate">
                        {svc.catalogName}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {formatServiceCategory(svc.category)}
                        {!svc.serviceTemplateId && (
                          <span className="ml-1 text-amber-600 dark:text-amber-400">
                            · not in catalogue
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {formatGbp(svc.feeLow)} – {formatGbp(svc.feeHigh)}
                      </div>
                      <div className="text-xs text-slate-500">
                        /{billingLabel(svc.billingCycle)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={applyToProposal}
                  className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
                >
                  Apply to proposal
                  <ArrowRightIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={explainPricing}
                  disabled={explaining}
                  className="btn-secondary flex-1 inline-flex items-center justify-center gap-2"
                >
                  <SparklesIcon className="h-4 w-4" />
                  {explaining ? 'Asking Clara…' : 'Explain pricing'}
                </button>
              </div>

              {explanation && (
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/40 text-sm text-slate-700 dark:text-slate-300">
                  <div className="flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">
                    <SparklesIcon className="h-3.5 w-3.5" />
                    Clara
                  </div>
                  {explanation}
                </div>
              )}

              <details className="text-xs text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300">
                  <InformationCircleIcon className="h-4 w-4" />
                  How fees are calculated
                </summary>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {result.formulaNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
