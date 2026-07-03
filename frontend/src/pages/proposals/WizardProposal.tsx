import { Link } from 'react-router-dom';
import { ArrowLeftIcon, SparklesIcon } from '@heroicons/react/24/outline';
import ProposalWizard from '../../components/proposals/ProposalWizard';
import { AI_COPILOT } from '../../config/aiCopilot';

export default function WizardProposal() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Create proposal in 5 minutes
              </h1>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {AI_COPILOT.name} guides you from client to signed engagement — review every step
            </p>
          </div>
        </div>
      </div>

      <ProposalWizard />
    </div>
  );
}