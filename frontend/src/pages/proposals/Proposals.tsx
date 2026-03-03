// Cache-bust: 2026-03-03T09:00:00Z - Force rebuild v7
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import DocumentTextIcon from '@heroicons/react/24/outline/DocumentTextIcon';            <h3 className="mt-4 text-lg font-medium text-gray-900">No proposals found</h3>
            <p className="mt-2 text-sm text-gray-500">
              Get started by creating your first proposal
            </p>
            <Link
              to="/proposals/new"
              className="mt-6 btn-primary inline-flex"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              Create Proposal
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Proposal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {proposals.map((proposal) => (
                  <tr key={proposal.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <Link
                          to={`/proposals/${proposal.id}`}
                          className="text-sm font-medium text-gray-900 hover:text-primary-600"
                        >
                          {proposal.title}
                        </Link>
                        <p className="text-xs text-gray-500">{proposal.reference}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{proposal.client?.name}</div>
                      <div className="text-xs text-gray-500">
                        {proposal.client?.companyType?.replace(/_/g, ' ')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`badge ${statusColors[proposal.status] || 'badge-gray'}`}>
                        {proposal.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="text-sm font-medium text-gray-900">
                        £{proposal.total?.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {proposal.paymentFrequency?.toLowerCase()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {proposal.createdAt && format(new Date(proposal.createdAt), 'dd MMM yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          to={`/proposals/${proposal.id}`}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </Link>
                        <button
                          onClick={() => downloadPDF(proposal.id, proposal.reference)}
                          className="text-gray-400 hover:text-gray-600"
                          title="Download PDF"
                        >
                          <ArrowDownTrayIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing page {meta.page} of {meta.totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setMeta({ ...meta, page: meta.page - 1 })}
                disabled={meta.page === 1}
                className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setMeta({ ...meta, page: meta.page + 1 })}
                disabled={meta.page === meta.totalPages}
                className="btn-secondary py-1.5 px-3 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Proposals;
