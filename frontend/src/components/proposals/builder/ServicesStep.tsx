import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalculatorIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { formatServiceCategory } from '../../../utils/serviceCategoryLabels';
import FeeBenchmarkChips from '../../pricing/FeeBenchmarkChips';
import ContingentFeeCalculator from '../../pricing/ContingentFeeCalculator';
import { InvestmentSummaryBands } from './InvestmentSummaryBands';
import { formatCurrency } from './shared';
import { useProposalBuilder } from './ProposalBuilderContext';

// Render Step 2: Services
export default function ServicesStep() {
  const {
    serviceSearch,
    setServiceSearch,
    categories,
    selectedCategory,
    setSelectedCategory,
    taxServiceLines,
    applyContingentFeeToLine,
    filteredServices,
    renderServiceRow,
    selectedServices,
    renderSelectedServiceRow,
    summary,
    reviewMonthlyCostIncVat,
    includeVat,
    setCurrentStep,
    goToReviewStep,
  } = useProposalBuilder();

  return (
    <div className="space-y-6">
      {/* Header with search */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Add Services</h2>
        <div className="relative">
          <input
            type="text"
            placeholder="Search services..."
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
            className="input-field w-full md:w-64 pl-10"
          />
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              selectedCategory === cat
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {cat === 'ALL' ? 'All categories' : formatServiceCategory(cat)}
          </button>
        ))}
      </div>

      <FeeBenchmarkChips categories={categories} />

      {taxServiceLines.length > 0 && (
        <ContingentFeeCalculator
          taxLines={taxServiceLines}
          onApplyFee={applyContingentFeeToLine}
          compact
        />
      )}

      {/* Two-column layout: Available Services | Selected Services */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1.2fr)] gap-6">
        {/* Available Services - Compact List */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wide">
            Available ({filteredServices.length})
          </h3>
          <div className="max-h-[500px] overflow-y-auto space-y-1 pr-1">
            {filteredServices.map(renderServiceRow)}
          </div>
        </div>

        {/* Selected Services */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wide">
            Selected ({selectedServices.length})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300">
            Tap a billing period per service — the price converts to match the new cadence.
          </p>

          {selectedServices.length === 0 ? (
            <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              <CalculatorIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Click services from the left to add them</p>
            </div>
          ) : (
            <>
              <div className="max-h-[min(70vh,560px)] overflow-y-auto space-y-2 pr-1">
                {selectedServices.map(renderSelectedServiceRow)}
              </div>

              {/* Investment by billing period */}
              <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800 space-y-3 text-sm">
                <InvestmentSummaryBands summary={summary} />
                {(summary.monthly.count > 0 ||
                  summary.annually.count > 0 ||
                  summary.quarterly.count > 0 ||
                  summary.weekly.count > 0) && (
                  <div className="flex justify-between items-baseline pt-2 border-t border-primary-200 dark:border-primary-800">
                    <div>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        Typical monthly cash flow
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-300 dark:text-slate-300 mt-0.5">
                        Recurring fees averaged per month (inc. VAT). One-time fees are separate.
                      </p>
                    </div>
                    <span className="text-xl font-bold text-primary-600 tabular-nums">
                      {formatCurrency(reviewMonthlyCostIncVat)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-primary-200 dark:border-primary-800 text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Subtotal (ex VAT)</span>
                  <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                    {formatCurrency(summary.totalSubtotalExVat)}
                  </span>
                </div>
                {includeVat && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">VAT</span>
                    <span className="font-medium text-slate-900 dark:text-white tabular-nums">
                      {formatCurrency(summary.totalVat)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-1">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    Combined total
                  </span>
                  <span className="text-lg font-bold text-primary-600 tabular-nums">
                    {formatCurrency(summary.contractTotalIncVat)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
        <button
          data-testid="services-back-button"
          onClick={() => setCurrentStep(1)}
          className="btn-secondary"
        >
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back
        </button>
        {selectedServices.length > 0 && (
          <button
            data-testid="services-continue-button"
            onClick={goToReviewStep}
            className="btn-primary"
          >
            Continue
            <ArrowRightIcon className="w-5 h-5 ml-2" />
          </button>
        )}
      </div>
    </div>
  );
}
