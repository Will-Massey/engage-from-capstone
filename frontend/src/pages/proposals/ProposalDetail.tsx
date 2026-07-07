/**
 * ProposalDetail — thin shell around the ProposalDetailProvider.
 *
 * All state, effects, handlers, and derived values live in
 * proposalDetail/ProposalDetailContext.tsx; the page layout is composed from
 * section components that read everything via useProposalDetail(). Public page
 * path and props are unchanged.
 */

import { ProposalDetailProvider, useProposalDetail } from './proposalDetail/ProposalDetailContext';
import DetailHeader from './proposalDetail/DetailHeader';
import EngagementSummary from './proposalDetail/EngagementSummary';
import OverviewTab from './proposalDetail/OverviewTab';
import AuditTab from './proposalDetail/AuditTab';
import DetailSidebar from './proposalDetail/DetailSidebar';
import DetailModals from './proposalDetail/DetailModals';

function ProposalDetailShell() {
  const { activeTab } = useProposalDetail();

  return (
    <div className="space-y-6 animate-fade-in">
      <DetailHeader />
      <EngagementSummary />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'audit' && <AuditTab />}
        </div>

        {/* Sidebar */}
        <DetailSidebar />
      </div>

      <DetailModals />
    </div>
  );
}

const ProposalDetail = () => (
  <ProposalDetailProvider>
    <ProposalDetailShell />
  </ProposalDetailProvider>
);

export default ProposalDetail;
