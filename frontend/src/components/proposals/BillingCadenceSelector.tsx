import {
  BILLING_CADENCE_OPTIONS,
  type BillingCadence,
  parseFrequencyOptions,
} from '../../utils/billingCadence';

interface BillingCadenceSelectorProps {
  value: string;
  onChange: (cadence: BillingCadence) => void;
  /** Comma-separated or array from service template; omit for all cadences */
  allowedCadences?: string | string[] | null;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Segmented control for choosing how often a service is billed.
 */
export default function BillingCadenceSelector({
  value,
  onChange,
  allowedCadences,
  size = 'md',
  className = '',
}: BillingCadenceSelectorProps) {
  const allowed = parseFrequencyOptions(allowedCadences);
  const options = BILLING_CADENCE_OPTIONS.filter(
    (o) => allowed.includes(o.value) || o.value === value
  );

  const btnClass =
    size === 'sm' ? 'px-2 py-0.5 text-[10px] rounded-md' : 'px-2.5 py-1 text-xs rounded-lg';

  return (
    <div
      className={`flex flex-wrap gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 ${className}`}
      role="group"
      aria-label="Billing period"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={`cadence-${opt.value.toLowerCase()}`}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={`${btnClass} font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${
              active
                ? 'bg-white dark:bg-slate-700 text-primary-700 dark:text-primary-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {size === 'sm' ? opt.short : opt.label}
          </button>
        );
      })}
    </div>
  );
}
