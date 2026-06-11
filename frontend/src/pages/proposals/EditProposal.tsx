import { Link, useParams } from 'react-router-dom';
import ProposalBuilder from '../../components/proposals/ProposalBuilder';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default function EditProposal() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link
          to={id ? `/proposals/${id}` : '/proposals'}
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Proposal</h1>
          <p className="text-sm text-slate-600">Update services, pricing, and cover letter</p>
        </div>
      </div>

      <div className="card p-6">
        <ProposalBuilder proposalId={id} />
      </div>
    </div>
  );
}
