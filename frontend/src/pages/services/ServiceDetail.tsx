import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  BuildingOfficeIcon,
  ClockIcon,
  CurrencyPoundIcon,
  TagIcon,
  StarIcon,
  DocumentTextIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

interface Service {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: string;
  basePrice: number;
  baseHours?: number;
  billingCycle?: string;
  defaultFrequency?: string;
  pricingModel?: string;
  isVatApplicable: boolean;
  isPopular: boolean;
  isActive: boolean;
  complexityFactors?: any[];
  requirements?: string[];
  deliverables?: string[];
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    proposalServices: number;
  };
}

const categoryColors: Record<string, string> = {
  COMPLIANCE: 'bg-blue-100 text-blue-800',
  ADVISORY: 'bg-purple-100 text-purple-800',
  TAX: 'bg-green-100 text-green-800',
  BOOKKEEPING: 'bg-yellow-100 text-yellow-800',
  CONSULTING: 'bg-pink-100 text-pink-800',
  TECHNICAL: 'bg-indigo-100 text-indigo-800',
  SPECIALIZED: 'bg-orange-100 text-orange-800',
  PAYROLL: 'bg-cyan-100 text-cyan-800',
};

const categoryLabels: Record<string, string> = {
  COMPLIANCE: 'Compliance',
  ADVISORY: 'Advisory',
  TAX: 'Tax',
  BOOKKEEPING: 'Bookkeeping',
  CONSULTING: 'Consulting',
  TECHNICAL: 'Technical',
  SPECIALIZED: 'Specialized',
  PAYROLL: 'Payroll',
};

const frequencyLabels: Record<string, string> = {
  ONE_TIME: 'One-time',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
};

const pricingModelLabels: Record<string, string> = {
  FIXED: 'Fixed Price',
  HOURLY: 'Hourly Rate',
  PER_EMPLOYEE: 'Per Employee',
  PER_TRANSACTION: 'Per Transaction',
  TIERED: 'Tiered Pricing',
};

const ServiceDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { tenant } = useAuthStore();
  const [service, setService] = useState<Service | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const loadService = async () => {
      if (!id) return;
      try {
        setIsLoading(true);
        const response = (await apiClient.getService(id)) as any;
        if (response.success) {
          setService(response.data);
        } else {
          toast.error('Service not found');
          navigate('/services');
        }
      } catch (error) {
        toast.error('Failed to load service');
        navigate('/services');
      } finally {
        setIsLoading(false);
      }
    };

    loadService();
  }, [id, navigate]);

  const handleDelete = async () => {
    try {
      setIsLoading(true);
      await apiClient.deleteService(id!);
      toast.success('Service deleted successfully');
      navigate('/services');
    } catch (error) {
      toast.error('Failed to delete service');
    } finally {
      setIsLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.duplicateService(id!)) as any;
      if (response.success) {
        toast.success('Service duplicated');
        navigate(`/services/${response.data.id}`);
      }
    } catch (error) {
      toast.error('Failed to duplicate service');
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

  if (!service) {
    return (
      <div className="text-center py-16">
        <h2 className="text-xl font-semibold text-slate-900">Service not found</h2>
        <Link to="/services" className="mt-4 text-primary-600 hover:text-primary-700">
          Back to services
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Back button */}
      <Link
        to="/services"
        className="inline-flex items-center text-sm text-slate-600 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-4 w-4 mr-1" />
        Back to services
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-900">{service.name}</h1>
            {service.isPopular && (
              <span className="badge badge-yellow flex items-center">
                <StarIcon className="h-3 w-3 mr-1" />
                Popular
              </span>
            )}
            {!service.isActive && <span className="badge badge-gray">Inactive</span>}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {categoryLabels[service.category] || service.category} • Created{' '}
            {service.createdAt ? new Date(service.createdAt).toLocaleDateString('en-GB') : 'N/A'}
          </p>
        </div>

        <div className="flex space-x-2">
          <button onClick={handleDuplicate} className="btn-secondary" title="Duplicate Service">
            <DocumentDuplicateIcon className="h-4 w-4 mr-2" />
            Duplicate
          </button>
          <Link to="/services" className="btn-secondary" title="Back to Services">
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            All Services
          </Link>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-danger"
            title="Delete Service"
          >
            <TrashIcon className="h-4 w-4 mr-2" />
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Description</h2>
            <p className="text-slate-700">{service.description}</p>
            {service.longDescription && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <h3 className="text-sm font-medium text-slate-800 mb-2">Detailed Description</h3>
                <p className="text-slate-600 whitespace-pre-wrap">{service.longDescription}</p>
              </div>
            )}
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Pricing</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center text-slate-600 mb-1">
                  <CurrencyPoundIcon className="h-4 w-4 mr-2" />
                  <span className="text-sm">Base Price</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  £{service.basePrice.toLocaleString()}
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center text-slate-600 mb-1">
                  <ClockIcon className="h-4 w-4 mr-2" />
                  <span className="text-sm">Base Hours</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">{service.baseHours || 1}h</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-600">Pricing Model:</span>
                <span className="ml-2 font-medium text-slate-900">
                  {pricingModelLabels[service.pricingModel || 'FIXED']}
                </span>
              </div>
              <div>
                <span className="text-slate-600">Default Frequency:</span>
                <span className="ml-2 font-medium text-slate-900">
                  {frequencyLabels[service.defaultFrequency || 'MONTHLY']}
                </span>
              </div>
            </div>
          </div>

          {/* Requirements & Deliverables */}
          {(service.requirements?.length || service.deliverables?.length) && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {service.requirements?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-800 mb-3">Requirements</h3>
                    <ul className="space-y-2">
                      {service.requirements.map((req, index) => (
                        <li key={index} className="flex items-start text-sm text-slate-600">
                          <CheckCircleIcon className="h-4 w-4 mr-2 text-green-500 flex-shrink-0 mt-0.5" />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {service.deliverables?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-800 mb-3">Deliverables</h3>
                    <ul className="space-y-2">
                      {service.deliverables.map((del, index) => (
                        <li key={index} className="flex items-start text-sm text-slate-600">
                          <DocumentTextIcon className="h-4 w-4 mr-2 text-blue-500 flex-shrink-0 mt-0.5" />
                          {del}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Category & Status */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-medium text-slate-800 mb-4">Service Information</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Category</span>
                <span
                  className={`badge ${categoryColors[service.category] || 'bg-slate-100 text-slate-800'}`}
                >
                  {categoryLabels[service.category] || service.category}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Status</span>
                <span className={`badge ${service.isActive ? 'badge-green' : 'badge-gray'}`}>
                  {service.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">VAT Applicable</span>
                <span className="text-slate-900">{service.isVatApplicable ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Usage Stats */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-medium text-slate-800 mb-4">Usage Statistics</h2>
            <div className="text-center py-4">
              <p className="text-4xl font-bold text-slate-900">
                {service._count?.proposalServices || 0}
              </p>
              <p className="text-sm text-slate-600 mt-1">Proposals using this service</p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-medium text-slate-800 mb-4">Quick Actions</h2>
            <div className="space-y-2">
              <Link
                to={`/proposals/new?serviceId=${id}`}
                className="btn-primary w-full justify-center"
              >
                <DocumentTextIcon className="h-4 w-4 mr-2" />
                Create Proposal
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <TrashIcon className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">
              Delete Service
            </h3>
            <p className="text-sm text-slate-600 text-center mb-6">
              Are you sure you want to delete "{service.name}"? This action cannot be undone.
              {service._count?.proposalServices > 0 && (
                <span className="block mt-2 text-red-600 font-medium">
                  Warning: This service is used in {service._count.proposalServices} proposal(s).
                </span>
              )}
            </p>
            <div className="flex space-x-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleDelete} className="btn-danger flex-1">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceDetail;
