import { useCallback, useMemo, useState } from 'react';
import { CalculatorIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';

export interface ContingentFeeLineTarget {
  id: string;
  name: string;
}

interface ContingentFeeCalculatorProps {
  /** Tax service lines available to receive the calculated fee */
  taxLines: ContingentFeeLineTarget[];
  onApplyFee: (lineId: string, feeGbp: number, explanation: string) => void;
  compact?: boolean;
}

function formatGbp(amount: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ContingentFeeCalculator({
  taxLines,
  onApplyFee,
  compact = false,
}: ContingentFeeCalculatorProps) {
  const [estimatedSaving, setEstimatedSaving] = useState('50000');
  const [percentOfSaving, setPercentOfSaving] = useState('25');
  const [capGbp, setCapGbp] = useState('');
  const [floorGbp, setFloorGbp] = useState('');
  const [targetLineId, setTargetLineId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ feeGbp: number; explanation: string } | null>(null);

  const effectiveTargetId = useMemo(() => {
    if (targetLineId && taxLines.some((l) => l.id === targetLineId)) return targetLineId;
    return taxLines[0]?.id ?? '';
  }, [targetLineId, taxLines]);

  const calculate = useCallback(async () => {
    const estimatedSavingGbp = parseFloat(estimatedSaving);
    const percent = parseFloat(percentOfSaving);
    const cap = capGbp.trim() ? parseFloat(capGbp) : undefined;
    const floor = floorGbp.trim() ? parseFloat(floorGbp) : undefined;

    if (!Number.isFinite(estimatedSavingGbp) || estimatedSavingGbp <= 0) {
      toast.error('Enter a valid estimated tax saving');
      return;
    }
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      toast.error('Enter a valid percentage (1–100)');
      return;
    }

    setLoading(true);
    try {
      const res = (await apiClient.pricingContingentFee({
        estimatedSavingGbp,
        percentOfSaving: percent,
        capGbp: cap,
        floorGbp: floor,
      })) as { success?: boolean; data?: { feeGbp: number; explanation: string } };

      if (res.success && res.data) {
        setResult(res.data);
      }
    } catch {
      toast.error('Could not calculate contingent fee — please try again');
    } finally {
      setLoading(false);
    }
  }, [estimatedSaving, percentOfSaving, capGbp, floorGbp]);

  const applyToLine = () => {
    if (!result || !effectiveTargetId) {
      toast.error('Calculate a fee and select a tax service line first');
      return;
    }
    onApplyFee(effectiveTargetId, result.feeGbp, result.explanation);
    toast.success('Contingent fee applied to proposal line');
  };

  if (taxLines.length === 0) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 shrink-0">
          <CalculatorIcon className="h-5 w-5 text-amber-700 dark:text-amber-300" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Contingent fee</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Tax advisory — fee as a percentage of estimated saving, with optional cap and floor.
          </p>
        </div>
      </div>

      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-4'}`}>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Estimated saving (£)
          </label>
          <input
            type="number"
            min={1}
            value={estimatedSaving}
            onChange={(e) => setEstimatedSaving(e.target.value)}
            className="input-field w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            % of saving
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={percentOfSaving}
            onChange={(e) => setPercentOfSaving(e.target.value)}
            className="input-field w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Cap (£, optional)
          </label>
          <input
            type="number"
            min={0}
            value={capGbp}
            onChange={(e) => setCapGbp(e.target.value)}
            placeholder="No cap"
            className="input-field w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Floor (£, optional)
          </label>
          <input
            type="number"
            min={0}
            value={floorGbp}
            onChange={(e) => setFloorGbp(e.target.value)}
            placeholder="No floor"
            className="input-field w-full text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mt-4">
        <button
          type="button"
          onClick={() => void calculate()}
          disabled={loading}
          className="btn-secondary text-sm inline-flex items-center gap-2"
        >
          <CalculatorIcon className="h-4 w-4" />
          {loading ? 'Calculating…' : 'Calculate fee'}
        </button>

        {result && (
          <div className="flex-1 min-w-[12rem] text-sm">
            <span className="font-semibold text-slate-900 dark:text-white">
              {formatGbp(result.feeGbp)}
            </span>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{result.explanation}</p>
          </div>
        )}
      </div>

      {result && (
        <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-amber-200/60 dark:border-amber-900/40">
          <div className="min-w-[12rem] flex-1">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Apply to tax service line
            </label>
            <select
              value={effectiveTargetId}
              onChange={(e) => setTargetLineId(e.target.value)}
              className="input-field w-full text-sm"
            >
              {taxLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={applyToLine}
            className="btn-primary text-sm inline-flex items-center gap-2"
          >
            Apply to line
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}