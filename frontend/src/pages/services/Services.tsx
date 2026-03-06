import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  BuildingOfficeIcon,
  StarIcon,
  DocumentDuplicateIcon,
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

const frequencyLabels: Record<string, string> = {
  ONE_TIME: 'One-time',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
};

const Services = () => {
  const { tenant } = useAuthStore();
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    longDescription: '',
    category: 'COMPLIANCE',
    basePrice: 0,
    baseHours: 1,
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
      const response = await apiClient.getServices() as any;
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
      const response = await apiClient.createService({
        ...formData,
        basePrice: Number(formData.basePrice),
        baseHours: Number(formData.baseHours),
      }) as any;
      
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
      const response = await apiClient.updateService(editingService.id, {
        ...formData,
        basePrice: Number(formData.basePrice),
        baseHours: Number(formData.baseHours),
      }) as any;
      
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
      const response = await apiClient.duplicateService(service.id) as any;
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

  const openEditModal = (service: Service) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description,
      longDescription: service.longDescription || '',
      category: service.category,
      basePrice: service.basePrice,
      baseHours: service.baseHours || 1,
      defaultFrequency: service.defaultFrequency || 'MONTHLY',
      pricingModel: service.pricingModel || 'FIXED',
      isPopular: service.isPopular,
      complexityFactors: service.complexityFactors || [],
      requirements: service.requirements || [],
      deliverables: service.deliverables || [],
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
      basePrice: 0,
      baseHours: 1,
      defaultFrequency: 'MONTHLY',
      pricingModel: 'FIXED',
      isPopular: false,
      complexityFactors: [],
      requirements: [],
      deliverables: [],
    });
  };

  const filteredServices = services.filter(service => {
    const matchesSearch = !searchQuery || 
      service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      service.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !categoryFilter || service.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const ServiceModal = ({ isEdit }: { isEdit: boolean }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {isEdit ? 'Edit Service' : 'Add New Service'}
          </h3>
          <button
            onClick={() => {
              isEdit ? setShowEditModal(false) : setShowAddModal(false);
              setEditingService(null);
            }}
            className="text-slate-400 hover:text-slate-700"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-800">Service Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 input-field w-full"
                placeholder="e.g., Annual Accounts"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-800">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="mt-1 input-field w-full"
              >
                <option value="COMPLIANCE">Compliance</option>
                <option value="ADVISORY">Advisory</option>
                <option value="TAX">Tax</option>
                <option value="BOOKKEEPING">Bookkeeping</option>
                <option value="CONSULTING">Consulting</option>
                <option value="TECHNICAL">Technical</option>
                <option value="PAYROLL">Payroll</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-800">Short Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="mt-1 input-field w-full"
              placeholder="Brief description for proposals..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-800">Long Description</label>
            <textarea
              rows={3}
              value={formData.longDescription}
              onChange={(e) => setFormData({ ...formData, longDescription: e.target.value })}
              className="mt-1 input-field w-full"
              placeholder="Detailed description of the service..."
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-800">Base Price (£)</label>
              <input
                type="number"
                value={formData.basePrice}
                onChange={(e) => setFormData({ ...formData, basePrice: Number(e.target.value) })}
                className="mt-1 input-field w-full"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-800">Base Hours</label>
              <input
                type="number"
                value={formData.baseHours}
                onChange={(e) => setFormData({ ...formData, baseHours: Number(e.target.value) })}
                className="mt-1 input-field w-full"
                min="0.1"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-800">Frequency</label>
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
              <label className="block text-sm font-medium text-slate-800">Pricing Model</label>
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
              <label htmlFor="isPopular" className="ml-2 text-sm text-slate-800">
                Mark as Popular Service
              </label>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 flex justify-end space-x-3">
          <button
            onClick={() => {
              isEdit ? setShowEditModal(false) : setShowAddModal(false);
              setEditingService(null);
            }}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={isEdit ? handleUpdateService : handleCreateService}
            disabled={isLoading || !formData.name || !formData.description}
            className="btn-primary"
          >
            {isLoading ? 'Saving...' : (isEdit ? 'Update Service' : 'Create Service')}
          </button>
        </div>
      </div>
    </div>
  );

  if (isLoading && services.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Services</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your service catalog and pricing
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="btn-primary inline-flex"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          Add Service
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
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
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="input-field w-48"
          >
            <option value="">All Categories</option>
            <option value="COMPLIANCE">Compliance</option>
            <option value="ADVISORY">Advisory</option>
            <option value="TAX">Tax</option>
            <option value="BOOKKEEPING">Bookkeeping</option>
            <option value="CONSULTING">Consulting</option>
            <option value="TECHNICAL">Technical</option>
            <option value="PAYROLL">Payroll</option>
          </select>
        </div>
      </div>

      {filteredServices.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200 shadow-sm">
          <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No services found</h3>
          <p className="mt-1 text-slate-600">Try adjusting your search or filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map((service) => (
            <div key={service.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${categoryColors[service.category] || 'bg-slate-100 text-slate-800'}`}>
                  {service.category}
                </span>
                <div className="flex items-center space-x-1">
                  {service.isPopular && <StarIcon className="h-4 w-4 text-yellow-400" />}
                </div>
              </div>
              
              <h3 className="font-semibold text-slate-900 mb-2">{service.name}</h3>
              <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                {service.description}
              </p>
              
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div>
                  <span className="text-2xl font-bold text-slate-900">
                    £{service.basePrice.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-600 ml-1">
                    /{frequencyLabels[service.defaultFrequency || service.billingCycle || 'MONTHLY']?.toLowerCase() || 'monthly'}
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <button 
                    onClick={() => handleDuplicateService(service)}
                    className="p-1 text-slate-400 hover:text-blue-600"
                    title="Duplicate"
                  >
                    <DocumentDuplicateIcon className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => openEditModal(service)}
                    className="p-1 text-slate-400 hover:text-primary-600"
                    title="Edit"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={() => handleDeleteService(service.id)}
                    className="p-1 text-slate-400 hover:text-red-600"
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
      {showAddModal && <ServiceModal isEdit={false} />}
      
      {/* Edit Modal */}
      {showEditModal && editingService && <ServiceModal isEdit={true} />}
    </div>
  );
};

export default Services;
