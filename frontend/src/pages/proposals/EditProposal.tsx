import { useParams } from 'react-router-dom';
import ProposalBuilder from '../../components/proposals/ProposalBuilder';

export default function EditProposal() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card p-6">
        <ProposalBuilder proposalId={id} />
      </div>
    </div>
  );
}
