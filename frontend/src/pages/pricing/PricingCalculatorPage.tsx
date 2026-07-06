import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import PricingCalculator from '../../components/pricing/PricingCalculator';

export default function PricingCalculatorPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link
          to="/services"
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pricing calculator</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Value-based fee suggestions for UK accountancy clients
          </p>
        </div>
      </div>

      <div className="card p-6">
        <PricingCalculator />
      </div>
    </div>
  );
}
