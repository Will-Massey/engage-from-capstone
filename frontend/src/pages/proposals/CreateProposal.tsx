import { useState } from 'react';
import { Link } from 'react-router-dom';
import ProposalBuilderV2 from '../../components/proposals/ProposalBuilder_v2';
import { ArrowLeftIcon, DocumentTextIcon } from '@heroicons/react/24/outline';

export default function CreateProposal() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/proposals"
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Create Proposal</h1>
          <p className="text-sm text-slate-600">Build a professional proposal for your client</p>
        </div>
      </div>

      {/* Builder */}
      <div className="card p-6">
        <ProposalBuilderV2 />
      </div>
    </div>
  );
}
