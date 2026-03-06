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
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useAuthStore();
  const [client, setClient] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    contactEmail: '',
    contactPhone: '',
    companyType: '',
    industry: '',
    companyNumber: '',
    utr: '',
    vatNumber: '',
    employeeCount: 0,
    turnover: 0,
    addressLine1: '',
    addressLine2: '',
    city: '',
    postcode: '',
  });

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
      // Error handled by UI
    } finally {
      setIsLoading(false);
    }
  };

  const openEditModal = () => {
    if (!client) return;
    
    setEditForm({
      name: client.name || '',
      contactEmail: client.contactEmail || '',
      contactPhone: client.contactPhone || '',
      companyType: client.companyType || '',
      industry: client.industry || '',
      companyNumber: client.companyNumber || '',
      utr: client.utr || '',
      vatNumber: client.vatNumber || '',
      employeeCount: client.employeeCount || 0,
      turnover: client.turnover || 0,
      addressLine1: client.address?.line1 || '',
      addressLine2: client.address?.line2 || '',
      city: client.address?.city || '',
      postcode: client.address?.postcode || '',
    });
    setShowEditModal(true);
  };

  const handleUpdateClient = async () => {
    try {
      setIsSaving(true);
      const updateData = {
        name: editForm.name,
        contactEmail: editForm.contactEmail,
        contactPhone: editForm.contactPhone,
        companyType: editForm.companyType,
        industry: editForm.industry,
        companyNumber: editForm.companyNumber,
        utr: editForm.utr,
        vatNumber: editForm.vatNumber,
        employeeCount: Number(editForm.employeeCount),
        turnover: Number(editForm.turnover),
        address: {
          line1: editForm.addressLine1,
          line2: editForm.addressLine2 || undefined,
          city: editForm.city,
          postcode: editForm.postcode,
          country: 'United Kingdom',
        },
      };

      await apiClient.updateClient(id!, updateData);
      toast.success('Client updated successfully');
      setShowEditModal(false);
      loadClient();
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsSaving(false);
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
        <h2 className="text-xl font-semibold text-slate-900">Client not found</h2>
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
        className="inline-flex items-center text-sm text-slate-600 hover:text-slate-800"
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
            <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
            <p className="text-sm text-slate-600">
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
          <button 
            onClick={openEditModal}
            className="btn-secondary"
          >
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
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {['overview', 'proposals', 'mtditsa', 'documents'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-slate-600 hover:text-slate-800 hover:border-slate-300'
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Contact Information</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <EnvelopeIcon className="h-5 w-5 text-slate-400 mr-3" />
                <span className="text-sm text-slate-900">{client.contactEmail}</span>
              </div>
              {client.contactPhone && (
                <div className="flex items-center">
                  <PhoneIcon className="h-5 w-5 text-slate-400 mr-3" />
                  <span className="text-sm text-slate-900">{client.contactPhone}</span>
                </div>
              )}
              {client.address && (
                <div className="flex items-start">
                  <MapPinIcon className="h-5 w-5 text-slate-400 mr-3 mt-0.5" />
                  <span className="text-sm text-slate-900">
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
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Company Details</h2>
            <div className="space-y-3">
              {client.companyNumber && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Company Number</span>
                  <span className="text-sm text-slate-900">{client.companyNumber}</span>
                </div>
              )}
              {client.utr && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">UTR</span>
                  <span className="text-sm text-slate-900">{client.utr}</span>
                </div>
              )}
              {client.vatNumber && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">VAT Number</span>
                  <span className="text-sm text-slate-900">{client.vatNumber}</span>
                </div>
              )}
              {client.employeeCount && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Employees</span>
                  <span className="text-sm text-slate-900">{client.employeeCount}</span>
                </div>
              )}
              {client.turnover && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Turnover</span>
                  <span className="text-sm text-slate-900">
                    £{client.turnover.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Statistics</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900">
                  {client.proposals?.length || 0}
                </p>
                <p className="text-xs text-slate-600">Total Proposals</p>
              </div>
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">
                  {client.proposals?.filter((p: any) => p.status === 'ACCEPTED').length || 0}
                </p>
                <p className="text-xs text-slate-600">Accepted</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'proposals' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          {client.proposals?.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">No proposals yet</h3>
              <Link
                to={`/proposals/new?clientId=${client.id}`}
                className="mt-4 btn-primary inline-flex"
              >
                Create First Proposal
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {client.proposals?.map((proposal: any) => (
                <Link
                  key={proposal.id}
                  to={`/proposals/${proposal.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{proposal.title}</p>
                    <p className="text-xs text-slate-600">
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
                    <p className="text-sm font-medium text-slate-900 mt-1">
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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
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
                <h3 className="text-sm font-medium text-slate-900 mb-3">Quarterly Deadlines (2026-27)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { q: 'Q1', period: 'Apr - Jul', filing: '5 Aug 2026' },
                    { q: 'Q2', period: 'Jul - Oct', filing: '5 Nov 2026' },
                    { q: 'Q3', period: 'Oct - Jan', filing: '5 Feb 2027' },
                    { q: 'Q4', period: 'Jan - Apr', filing: '5 May 2027' },
                  ].map((deadline) => (
                    <div key={deadline.q} className="bg-slate-50 p-3 rounded-lg text-center">
                      <p className="font-semibold text-slate-900">{deadline.q}</p>
                      <p className="text-xs text-slate-600">{deadline.period}</p>
                      <p className="text-sm text-primary-600 mt-1">{deadline.filing}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-900 mb-3">Recommended Services</h3>
                <ul className="space-y-2">
                  <li className="flex items-center text-sm text-slate-700">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    Quarterly bookkeeping & record keeping
                  </li>
                  <li className="flex items-center text-sm text-slate-700">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    MTD-compatible software setup and training
                  </li>
                  <li className="flex items-center text-sm text-slate-700">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    Quarterly submission service
                  </li>
                  <li className="flex items-center text-sm text-slate-700">
                    <span className="w-2 h-2 bg-primary-500 rounded-full mr-2"></span>
                    Year-end tax return preparation
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-600">
                This client is not required to comply with MTD ITSA.
              </p>
              {client.mtditsaIncome && (
                <p className="text-sm text-slate-400 mt-2">
                  Estimated income: £{client.mtditsaIncome.toLocaleString()}
                </p>
              )}
              {client.companyType && !['SOLE_TRADER', 'PARTNERSHIP'].includes(client.companyType) && (
                <p className="text-sm text-blue-600 mt-4 bg-blue-50 p-3 rounded-lg max-w-md mx-auto">
                  ℹ️ MTD ITSA only applies to Sole Traders and Partnerships. 
                  {client.companyType === 'LIMITED_COMPANY' && ' Limited companies file Corporation Tax returns instead.'}
                  {client.companyType === 'LLP' && ' LLPs file Corporation Tax returns instead.'}
                  {client.companyType === 'CHARITY' && ' Charities are exempt from MTD ITSA.'}
                  {client.companyType === 'NON_PROFIT' && ' Non-profit organisations are exempt from MTD ITSA.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Edit Client</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">Client Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Company Type</label>
                  <select
                    value={editForm.companyType}
                    onChange={(e) => setEditForm({ ...editForm, companyType: e.target.value })}
                    className="mt-1 input-field w-full"
                  >
                    <option value="LIMITED_COMPANY">Limited Company</option>
                    <option value="SOLE_TRADER">Sole Trader</option>
                    <option value="PARTNERSHIP">Partnership</option>
                    <option value="LLP">LLP</option>
                    <option value="CHARITY">Charity</option>
                    <option value="NON_PROFIT">Non-Profit</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">Email</label>
                  <input
                    type="email"
                    value={editForm.contactEmail}
                    onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Phone</label>
                  <input
                    type="tel"
                    value={editForm.contactPhone}
                    onChange={(e) => setEditForm({ ...editForm, contactPhone: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">Company Number</label>
                  <input
                    type="text"
                    value={editForm.companyNumber}
                    onChange={(e) => setEditForm({ ...editForm, companyNumber: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">UTR</label>
                  <input
                    type="text"
                    value={editForm.utr}
                    onChange={(e) => setEditForm({ ...editForm, utr: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">VAT Number</label>
                  <input
                    type="text"
                    value={editForm.vatNumber}
                    onChange={(e) => setEditForm({ ...editForm, vatNumber: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Industry</label>
                  <input
                    type="text"
                    value={editForm.industry}
                    onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">Employees</label>
                  <input
                    type="number"
                    value={editForm.employeeCount}
                    onChange={(e) => setEditForm({ ...editForm, employeeCount: Number(e.target.value) })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Turnover (£)</label>
                  <input
                    type="number"
                    value={editForm.turnover}
                    onChange={(e) => setEditForm({ ...editForm, turnover: Number(e.target.value) })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800">Address Line 1</label>
                <input
                  type="text"
                  value={editForm.addressLine1}
                  onChange={(e) => setEditForm({ ...editForm, addressLine1: e.target.value })}
                  className="mt-1 input-field w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800">Address Line 2</label>
                <input
                  type="text"
                  value={editForm.addressLine2}
                  onChange={(e) => setEditForm({ ...editForm, addressLine2: e.target.value })}
                  className="mt-1 input-field w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-800">City</label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Postcode</label>
                  <input
                    type="text"
                    value={editForm.postcode}
                    onChange={(e) => setEditForm({ ...editForm, postcode: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowEditModal(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateClient}
                disabled={isSaving || !editForm.name || !editForm.contactEmail}
                className="btn-primary"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientDetail;
