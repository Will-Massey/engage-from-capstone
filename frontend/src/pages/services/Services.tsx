import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  StarIcon,
  DocumentDuplicateIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { formatCurrency } from '../../utils/formatters';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import { SkeletonCard } from '../../components/skeleton/SkeletonCard';
import { EmptyServices } from '../../components/empty-states/EmptyStates';
import { formatServiceCategory, SERVICE_CATEGORY_OPTIONS } from '../../utils/serviceCategoryLabels';

interface Service {
  id: string;
  name: string;
  description: string;
  longDescription?: string;
  category: string;
  // v2 pricing fields
  priceAmount?: number;
  billingCycle?: string;
  priceDisplayMode?: string;
  // legacy fields
  basePrice: number;
  baseHours?: number;
  defaultFrequency?: string;
  pricingModel?: string;
  isVatApplicable: boolean;
  isPopular: boolean;
  isActive: boolean;
  complexityFactors?: any[];
  requirements?: string[];
  deliverables?: string[];
}

const categoryColors: Record<string, string> = {
  COMPLIANCE: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  ADVISORY: 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200',
  TAX: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  BOOKKEEPING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  CONSULTING: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200',
  TECHNICAL: 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200',
  SPECIALIZED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  PAYROLL: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200',
};

const frequencyLabels: Record<string, string> = {
  ONE_TIME: 'One-time',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
};

type ServiceFormData = {
  name: string;
  description: string;
  longDescription: string;
  category: string;
  basePrice: string;
  defaultFrequency: string;
  pricingModel: string;
  isPopular: boolean;
  complexityFactors: any[];
  requirements: string[];
  deliverables: string[];
};

interface ServiceModalProps {
  formData: ServiceFormData;
  setFormData: Dispatch<SetStateAction<ServiceFormData>>;
  isLoading: boolean;
  isEdit: boolean;
  onClose: () => void;
  onSave: () => void;
}

const ServiceModal = ({
  formData,
  setFormData,
  isLoading,
  isEdit,
  onClose,
  onSave,
}: ServiceModalProps) => (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="glass-tile rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {isEdit ? 'Edit Service' : 'Add New Service'}
        </h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Service Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="mt-1 input-field w-full"
              placeholder="e.g., Annual Accounts"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Category
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="mt-1 input-field w-full"
            >
              {SERVICE_CATEGORY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Short Description
          </label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="mt-1 input-field w-full"
            placeholder="Brief description for proposals..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
            Long Description
          </label>
          <textarea
            rows={3}
            value={formData.longDescription}
            onChange={(e) => setFormData({ ...formData, longDescription: e.target.value })}
            className="mt-1 input-field w-full"
            placeholder="Detailed description of the service..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Price (£)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={formData.basePrice}
              onChange={(e) => {
                const next = e.target.value;
                if (next === '' || /^[0-9]*\.?[0-9]*$/.test(next)) {
                  setFormData({ ...formData, basePrice: next });
                }
              }}
              className="mt-1 input-field w-full"
              placeholder="e.g. 150"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Frequency
            </label>
            <select
              value={formData.defaultFrequency}
              onChange={(e) => setFormData({ ...formData, defaultFrequency: e.target.value })}
              className="mt-1 input-field w-full"
            >
              <option value="ONE_TIME">One-time</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUALLY">Annually</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
              Pricing Model
            </label>
            <select
              value={formData.pricingModel}
              onChange={(e) => setFormData({ ...formData, pricingModel: e.target.value })}
              className="mt-1 input-field w-full"
            >
              <option value="FIXED">Fixed Price</option>
              <option value="HOURLY">Hourly Rate</option>
              <option value="PER_EMPLOYEE">Per Employee</option>
              <option value="PER_TRANSACTION">Per Transaction</option>
              <option value="TIERED">Tiered</option>
            </select>
          </div>
          <div className="flex items-center pt-6">
            <input
              type="checkbox"
              id="isPopular"
              checked={formData.isPopular}
              onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
              className="h-4 w-4 text-primary-600 border-gray-300 rounded"
            />
            <label htmlFor="isPopular" className="ml-2 text-sm text-slate-800 dark:text-slate-200">
              Mark as Popular Service
            </label>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end space-x-3">
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={isLoading || !formData.name || !formData.description}
          className="btn-primary"
        >
          {isLoading ? 'Saving...' : isEdit ? 'Update Service' : 'Create Service'}
        </button>
      </div>
    </div>
  </div>
);

const Services = () => {
  const { tenant } = useAuthStore();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [billingFilter, setBillingFilter] = useState('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  // Form states — basePrice kept as string so price fields accept free typing
  const [formData, setFormData] = useState<ServiceFormData>({
    name: '',
    description: '',
    longDescription: '',
    category: 'COMPLIANCE',
    basePrice: '',
    defaultFrequency: 'MONTHLY',
    pricingModel: 'FIXED',
    isPopular: false,
    complexityFactors: [] as any[],
    requirements: [] as string[],
    deliverables: [] as string[],
  });

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.getServices()) as any;
      setServices(response.data || []);
    } catch (error) {
      toast.error('Failed to load services');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateService = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.createService({
        ...formData,
        description: formData.description.trim() || formData.name.trim(),
        basePrice: parseFloat(formData.basePrice) || 0,
        priceAmount: parseFloat(formData.basePrice) || 0,
        defaultFrequency: formData.defaultFrequency,
        billingCycle: formData.defaultFrequency,
      })) as any;

      if (response.success) {
        toast.success('Service created successfully');
        setShowAddModal(false);
        resetForm();
        loadServices();
      }
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateService = async () => {
    if (!editingService) return;

    try {
      setIsLoading(true);
      const response = (await apiClient.updateService(editingService.id, {
        ...formData,
        basePrice: parseFloat(formData.basePrice) || 0,
        priceAmount: parseFloat(formData.basePrice) || 0,
      })) as any;

      if (response.success) {
        toast.success('Service updated successfully');
        setShowEditModal(false);
        setEditingService(null);
        resetForm();
        loadServices();
      }
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service?')) return;

    try {
      setIsLoading(true);
      await apiClient.deleteService(id);
      toast.success('Service deleted');
      loadServices();
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicateService = async (service: Service) => {
    try {
      setIsLoading(true);
      const response = (await apiClient.duplicateService(service.id)) as any;
      if (response.success) {
        toast.success('Service duplicated');
        loadServices();
      }
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsLoading(false);
    }
  };

  const parseJsonField = (value: any): any[] => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return [];
  };

  const openEditModal = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description,
      longDescription: service.longDescription || '',
      category: service.category,
      basePrice: String(service.priceAmount ?? service.basePrice ?? ''),
      defaultFrequency: service.billingCycle || service.defaultFrequency || 'MONTHLY',
      pricingModel: service.pricingModel || 'FIXED',
      isPopular: service.isPopular,
      complexityFactors: parseJsonField(service.complexityFactors),
      requirements: parseJsonField(service.requirements),
      deliverables: parseJsonField(service.deliverables),
    });
    setShowEditModal(true);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      longDescription: '',
      category: 'COMPLIANCE',
      basePrice: '',
      defaultFrequency: 'MONTHLY',
      pricingModel: 'FIXED',
      isPopular: false,
      complexityFactors: [],
      requirements: [],
      deliverables: [],
    });
  };

  const filteredServices = services.filter((service) => {
    const matchesSearch =
      !searchQuery ||
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !categoryFilter || service.category === categoryFilter;
    const billing = service.billingCycle || service.defaultFrequency || 'MONTHLY';
    const matchesBilling = !billingFilter || billing === billingFilter;
    return matchesSearch && matchesCategory && matchesBilling;
  });

  const closeAddModal = () => {
    setShowAddModal(false);
    setEditingService(null);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingService(null);
  };

  if (isLoading && services.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">
          <button className="btn-primary inline-flex opacity-50 cursor-not-allowed">
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Service
          </button>
        </div>
        <div className="card p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 h-10 bg-slate-200 rounded animate-pulse" />
            <div className="w-48 h-10 bg-slate-200 rounded animate-pulse" />
          </div>
        </div>
        <SkeletonCard count={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4 -mt-2">
        <button onClick={openAddModal} className="btn-primary inline-flex shrink-0">
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Service
        </button>
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10 w-full"
              placeholder="Search services..."
            />
          </div>
          <select
            value={billingFilter}
            onChange={(e) => setBillingFilter(e.target.value)}
            className="input-field w-44"
          >
            <option value="">All billing types</option>
            <option value="MONTHLY">Monthly</option>
            <option value="ANNUALLY">Annual</option>
            <option value="ONE_TIME">One-time</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-field w-48"
          >
            <option value="">All categories</option>
            {SERVICE_CATEGORY_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredServices.length === 0 ? (
        <EmptyServices />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className="glass-tile p-5 transition-colors hover:border-slate-300 dark:hover:border-slate-600"
            >
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${categoryColors[service.category] || 'bg-slate-100 text-slate-800'}`}
                >
                  {formatServiceCategory(service.category)}
                </span>
                <div className="flex items-center space-x-1">
                  {service.isPopular && <StarIcon className="h-4 w-4 text-yellow-400" />}
                </div>
              </div>

              <h3 className="font-semibold text-slate-900 dark:text-white mb-2">{service.name}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 mb-4">
                {service.description}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-700">
                <div>
                  <span className="text-2xl font-bold text-slate-900 dark:text-white">
                    <span className="tabular-nums">
                      {formatCurrency(service.priceAmount || service.basePrice || 0)}
                    </span>
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-300 ml-1">
                    /
                    {frequencyLabels[
                      service.billingCycle || service.defaultFrequency || 'MONTHLY'
                    ]?.toLowerCase() || 'monthly'}
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleDuplicateService(service)}
                    className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                    title="Duplicate"
                  >
                    <DocumentDuplicateIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => openEditModal(service)}
                    className="p-1 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400"
                    title="Edit"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteService(service.id)}
                    className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                    title="Delete"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <ServiceModal
          isEdit={false}
          formData={formData}
          setFormData={setFormData}
          isLoading={isLoading}
          onClose={closeAddModal}
          onSave={handleCreateService}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && editingService && (
        <ServiceModal
          isEdit={true}
          formData={formData}
          setFormData={setFormData}
          isLoading={isLoading}
          onClose={closeEditModal}
          onSave={handleUpdateService}
        />
      )}
    </div>
  );
};

export default Services;
