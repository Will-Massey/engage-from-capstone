import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  BuildingOfficeIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useAuthStore();
  const [client, setClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    if (id) {
      loadClient();
    }
  }, [id]);

  const loadClient = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getClient(id!) as any;
      setClient(response.data);
    } catch (error) {
      console.error('Failed to load client', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-gray-900">Client not found</h2>
        <Link to="/clients" className="mt-4 text-primary-600 hover:text-primary-500">
          Back to clients
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <Link
        to="/clients"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to clients
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center">
          <div className="p-3 bg-primary-100 rounded-lg">
            <BuildingOfficeIcon className="h-8 w-8 text-primary-600" />
          </div>
          <div className="ml-4">
            <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
            <p className="text-sm text-gray-500">
              {client.companyType?.replace(/_/g, ' ')} • {client.industry || 'No industry set'}
            </p>
          </div>
        </div>
        <div className="flex space-x-3">
          <Link
            to={`/proposals/new?clientId=${client.id}`}
            className="btn-primary"
            style={{ backgroundColor: tenant?.primaryColor || '#0ea5e9' }}
          >
            <DocumentTextIcon className="h-4 w-4 mr-2" />
            New Proposal
          </Link>
          <button className="btn-secondary">
            <PencilIcon className="h-4 w-4 mr-2" />
            Edit
          </button>
        </div>
      </div>

      {/* MTD ITSA Alert */}
      {client.mtditsaEligible && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start">
          <ClockIcon className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-orange-800">
              MTD ITSA Required by April 2026
            </h3>
            <p className="mt-1 text-sm text-orange-700">
              This client has an estimated income of £{client.mtditsaIncome?.toLocaleString()} 
              and must comply with Making Tax Digital for Income Tax Self Assessment.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['overview', 'proposals', 'mtditsa', 'documents'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'mtditsa' ? 'MTD ITSA' : tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Contact Info */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <EnvelopeIcon className="h-5 w-5 text-gray-400 mr-3" />
                <span className="text-sm text-gray-900">{client.contactEmail}</span>
              </div>
              {client.contactPhone && (
                <div className="flex items-center">
                  <PhoneIcon className="h-5 w-5 text-gray-400 mr-3" />
                  <span className="text-sm text-gray-900">{client.contactPhone}</span>
                </div>
              )}
              {client.address && (
                <div className="flex items-start">
                  <MapPinIcon className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                  <span className="text-sm text-gray-900">
                    {client.address.line1}
                    {client.address.line2 && <>, {client.address.line2}</>}
                    <br />
                    {client.address.city}, {client.address.postcode}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Company Details */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Details</h2>
            <div className="space-y-3">
              {client.companyNumber && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Company Number</span>
                  <span className="text-sm text-gray-900">{client.companyNumber}</span>
                </div>
              )}
              {client.utr && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">UTR</span>
                  <span className="text-sm text-gray-900">{client.utr}</span>
                </div>
              )}
              {client.vatNumber && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">VAT Number</span>
                  <span className="text-sm text-gray-900">{client.vatNumber}</span>
                </div>
              )}
              {client.employeeCount && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Employees</span>
                  <span className="text-sm text-gray-900">{client.employeeCount}</span>
                </div>
              )}
              {client.turnover && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Turnover</span>
                  <span className="text-sm text-gray-900">
                    £{client.turnover.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Statistics</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">
                  {client.proposals?.length || 0}
                </p>
                <p className="text-xs text-gray-500">Total Proposals</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {client.proposals?.filter((p: any) => p.status === 'ACCEPTED').length || 0}
                </p>
                <p className="text-xs text-gray-500">Accepted</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'proposals' && (
        <div className="card">
          {client.proposals?.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No proposals yet</h3>
              <Link
                to={`/proposals/new?clientId=${client.id}`}
                className="mt-4 btn-primary inline-flex"
              >
                Create First Proposal
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {client.proposals?.map((proposal: any) => (
                <Link
                  key={proposal.id}
                  to={`/proposals/${proposal.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{proposal.title}</p>
                    <p className="text-xs text-gray-500">
                      {proposal.reference} • {format(new Date(proposal.createdAt), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${
                      proposal.status === 'ACCEPTED' ? 'badge-green' :
                      proposal.status === 'SENT' ? 'badge-blue' :
                      'badge-gray'
                    }`}>
                      {proposal.status}
                    </span>
                    <p className="text-sm font-medium text-gray-900 mt-1">
                      £{proposal.total?.toLocaleString()}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mtditsa' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Making Tax Digital for Income Tax Self Assessment
          </h2>
          
          {client.mtditsaEligible ? (
            <div className="space-y-6">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Status:</strong> Required by April 2026
                </p>
                <p className="text-sm text-orange-700 mt-1">
                  This client must submit quarterly updates to HMRC using compatible software.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Quarterly Deadlines (2026-27)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { q: 'Q1', period: 'Apr - Jul', filing: '5 Aug 2026' },
                    { q: 'Q2', period: 'Jul - Oct', filing: '5 Nov 2026' },
                    { q: 'Q3', period: 'Oct - Jan', filing: '5 Feb 2027' },
                    { q: 'Q4', period: 'Jan - Apr', filing: '5 May 2027' },
                  ].map((deadline) => (
                    <div key={deadline.q} className="bg-gray-50 p-3 rounded-lg text-center">
                      <p className="font-semibold text-gray-900">{deadline.q}</p>
                      <p className="text-xs text-gray-500">{deadline.period}</p>
                      <p className="text-sm text-primary-600 mt-1">{deadline.filing}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Recommended Services</h3>
                <ul className="space-y-2">
                  <li className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    Quarterly bookkeeping & record keeping
                  </li>
                  <li className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    MTD-compatible software setup and training
                  </li>
                  <li className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    Quarterly submission service
                  </li>
                  <li className="flex items-center text-sm text-gray-600">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    Year-end tax return preparation
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">
                This client is not currently required to comply with MTD ITSA.
              </p>
              {client.mtditsaIncome && (
                <p className="text-sm text-gray-400 mt-2">
                  Estimated income: £{client.mtditsaIncome.toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientDetail;
