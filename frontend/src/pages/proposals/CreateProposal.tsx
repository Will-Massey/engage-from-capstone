import ProposalBuilder from '../../components/proposals/ProposalBuilder';

export default function CreateProposal() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card p-6">
        <ProposalBuilder />
      </div>
    </div>
  );
}
