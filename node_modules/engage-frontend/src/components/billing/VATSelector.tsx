import { useState, useEffect } from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';

export type VATRate = 'STANDARD_20' | 'REDUCED_5' | 'ZERO' | 'EXEMPT';

interface VATOption {
  value: VATRate;
  label: string;
  rate: number;
  description: string;
}

interface VATSelectorProps {
  value: VATRate;
  isVatApplicable: boolean;
  onChange: (vatRate: VATRate, isApplicable: boolean) => void;
  disabled?: boolean;
}

const vatOptions: VATOption[] = [
  {
    value: 'STANDARD_20',
    label: 'Standard Rate',
    rate: 20,
    description: 'Most goods and services',
  },
  {
    value: 'REDUCED_5',
    label: 'Reduced Rate',
    rate: 5,
    description: 'Energy-saving materials, residential conversions',
  },
  {
    value: 'ZERO',
    label: 'Zero Rated',
    rate: 0,
    description: 'Food, books, children\'s clothing',
  },
  {
    value: 'EXEMPT',
    label: 'Exempt',
    rate: 0,
    description: 'Insurance, education, healthcare',
  },
];

const VATSelector = ({ value, isVatApplicable, onChange, disabled }: VATSelectorProps) => {
  const [isApplicable, setIsApplicable] = useState(isVatApplicable);
  const [selectedRate, setSelectedRate] = useState<VATRate>(value);

  useEffect(() => {
    setIsApplicable(isVatApplicable);
    setSelectedRate(value);
  }, [isVatApplicable, value]);

  const handleApplicableChange = (applicable: boolean) => {
    setIsApplicable(applicable);
    onChange(selectedRate, applicable);
  };

  const handleRateChange = (rate: VATRate) => {
    setSelectedRate(rate);
    onChange(rate, isApplicable);
  };

  const selectedOption = vatOptions.find((o) => o.value === selectedRate);

  return (
    <div className="space-y-4">
      {/* VAT Applicable Toggle */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <label className="text-sm font-medium text-gray-900">VAT Applicable</label>
          <p className="text-sm text-gray-500">
            Enable to charge VAT on this service
          </p>
        </div>
        <button
          type="button"
          onClick={() => !disabled && handleApplicableChange(!isApplicable)}
          disabled={disabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            isApplicable ? 'bg-primary-600' : 'bg-gray-200'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              isApplicable ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* VAT Rate Selection */}
      {isApplicable && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            VAT Rate
          </label>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vatOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => !disabled && handleRateChange(option.value)}
                disabled={disabled}
                className={`relative flex items-center p-3 rounded-lg border-2 text-left transition-all ${
                  selectedRate === option.value
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-gray-200 hover:border-primary-300'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{option.label}</span>
                    <span className="text-lg font-bold text-primary-600">
                      {option.rate}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                </div>
                
                {selectedRate === option.value && (
                  <div className="ml-3">
                    <div className="h-5 w-5 rounded-full bg-primary-600 flex items-center justify-center">
                      <CheckIcon className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Selected Rate Summary */}
          {selectedOption && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-blue-900">
                    Selected: {selectedOption.label}
                  </span>
                  <p className="text-xs text-blue-700 mt-1">
                    {selectedOption.description}
                  </p>
                </div>
                <span className="text-2xl font-bold text-blue-600">
                  {selectedOption.rate}%
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {!isApplicable && (
        <div className="p-4 bg-gray-100 rounded-lg">
          <p className="text-sm text-gray-600">
            <span className="font-medium">No VAT</span> will be charged on this service.
          </p>
        </div>
      )}
    </div>
  );
};

// Helper function to calculate VAT amount
export const calculateVAT = (amount: number, vatRate: VATRate): number => {
  const rates: Record<VATRate, number> = {
    STANDARD_20: 0.20,
    REDUCED_5: 0.05,
    ZERO: 0,
    EXEMPT: 0,
  };
  return amount * rates[vatRate];
};

// Helper function to get VAT rate percentage
export const getVATPercentage = (vatRate: VATRate): number => {
  const rates: Record<VATRate, number> = {
    STANDARD_20: 20,
    REDUCED_5: 5,
    ZERO: 0,
    EXEMPT: 0,
  };
  return rates[vatRate];
};

// Helper function to format VAT display
export const formatVATDisplay = (vatRate: VATRate): string => {
  const percentages: Record<VATRate, string> = {
    STANDARD_20: '20%',
    REDUCED_5: '5%',
    ZERO: '0%',
    EXEMPT: 'Exempt',
  };
  return percentages[vatRate];
};

export default VATSelector;
