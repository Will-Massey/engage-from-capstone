import { useState, useEffect } from 'react';
import { apiClient } from '../../utils/api';
import { CalendarIcon, ClockIcon } from '@heroicons/react/24/outline';

export type BillingCycle = 'FIXED_DATE' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';

interface BillingCycleOption {
  value: BillingCycle;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface BillingCycleSelectorProps {
  value: BillingCycle;
  onChange: (cycle: BillingCycle, details: BillingCycleDetails) => void;
  disabled?: boolean;
}

export interface BillingCycleDetails {
  billingCycle: BillingCycle;
  fixedBillingDate?: string;
  billingDayOfMonth?: number;
}

const billingCycleOptions: BillingCycleOption[] = [
  {
    value: 'MONTHLY',
    label: 'Monthly',
    description: '12 equal payments per year',
    icon: <ClockIcon className="h-5 w-5" />,
  },
  {
    value: 'QUARTERLY',
    label: 'Quarterly',
    description: '4 payments per year',
    icon: <CalendarIcon className="h-5 w-5" />,
  },
  {
    value: 'ANNUALLY',
    label: 'Annually',
    description: 'Single annual payment',
    icon: <CalendarIcon className="h-5 w-5" />,
  },
  {
    value: 'WEEKLY',
    label: 'Weekly',
    description: '52 payments per year',
    icon: <ClockIcon className="h-5 w-5" />,
  },
  {
    value: 'FIXED_DATE',
    label: 'Fixed Date',
    description: 'Bill on specific date(s)',
    icon: <CalendarIcon className="h-5 w-5" />,
  },
];

const BillingCycleSelector = ({ value, onChange, disabled }: BillingCycleSelectorProps) => {
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>(value);
  const [billingDay, setBillingDay] = useState<number>(1);
  const [fixedDate, setFixedDate] = useState<string>('');
  const [annualCost, setAnnualCost] = useState<number>(0);

  useEffect(() => {
    setSelectedCycle(value);
  }, [value]);

  const handleCycleChange = (cycle: BillingCycle) => {
    setSelectedCycle(cycle);
    
    const details: BillingCycleDetails = {
      billingCycle: cycle,
    };

    if (cycle === 'MONTHLY' && billingDay) {
      details.billingDayOfMonth = billingDay;
    }

    if (cycle === 'FIXED_DATE' && fixedDate) {
      details.fixedBillingDate = fixedDate;
    }

    onChange(cycle, details);
  };

  const calculateMonthlyEquivalent = (annualAmount: number, cycle: BillingCycle): number => {
    switch (cycle) {
      case 'WEEKLY':
        return annualAmount / 52;
      case 'MONTHLY':
        return annualAmount / 12;
      case 'QUARTERLY':
        return annualAmount / 4;
      case 'ANNUALLY':
        return annualAmount;
      case 'FIXED_DATE':
        return annualAmount;
      default:
        return annualAmount / 12;
    }
  };

  const getPaymentFrequency = (cycle: BillingCycle): string => {
    switch (cycle) {
      case 'WEEKLY':
        return '52';
      case 'MONTHLY':
        return '12';
      case 'QUARTERLY':
        return '4';
      case 'ANNUALLY':
        return '1';
      default:
        return '1';
    }
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">Billing Cycle</label>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {billingCycleOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => !disabled && handleCycleChange(option.value)}
            disabled={disabled}
            className={`relative flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all ${
              selectedCycle === option.value
                ? 'border-primary-600 bg-primary-50'
                : 'border-gray-200 hover:border-primary-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className={`p-2 rounded-lg ${
              selectedCycle === option.value ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {option.icon}
            </div>
            <span className="mt-2 font-medium text-gray-900">{option.label}</span>
            <span className="text-xs text-gray-500">{option.description}</span>
            
            {selectedCycle === option.value && (
              <div className="absolute top-2 right-2">
                <div className="h-5 w-5 rounded-full bg-primary-600 flex items-center justify-center">
                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Additional options based on selected cycle */}
      {selectedCycle === 'MONTHLY' && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700">
            Billing Day of Month
          </label>
          <select
            value={billingDay}
            onChange={(e) => {
              const day = parseInt(e.target.value);
              setBillingDay(day);
              onChange(selectedCycle, {
                billingCycle: selectedCycle,
                billingDayOfMonth: day,
              });
            }}
            disabled={disabled}
            className="mt-1 input-field w-32"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Day of the month when invoices will be issued
          </p>
        </div>
      )}

      {selectedCycle === 'FIXED_DATE' && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700">
            Fixed Billing Date
          </label>
          <input
            type="date"
            value={fixedDate}
            onChange={(e) => {
              setFixedDate(e.target.value);
              onChange(selectedCycle, {
                billingCycle: selectedCycle,
                fixedBillingDate: e.target.value,
              });
            }}
            disabled={disabled}
            className="mt-1 input-field"
          />
          <p className="mt-1 text-xs text-gray-500">
            Specific date for billing (e.g., for one-off services)
          </p>
        </div>
      )}

      {/* Cost Breakdown */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
        <h4 className="text-sm font-medium text-blue-900">Payment Schedule</h4>
        <div className="mt-2 space-y-1 text-sm text-blue-700">
          <p>
            <span className="font-medium">Frequency:</span>{' '}
            {getPaymentFrequency(selectedCycle)} payment(s) per year
          </p>
          {annualCost > 0 && (
            <p>
              <span className="font-medium">Monthly Equivalent:</span>{' '}
              £{calculateMonthlyEquivalent(annualCost, selectedCycle).toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingCycleSelector;
