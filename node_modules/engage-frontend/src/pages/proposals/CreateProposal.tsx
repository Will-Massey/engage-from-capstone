import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  ChevronDownIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

interface Service {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  category: string;
}

interface Client {
  id: string;
  name: string;
  companyType: string;
}

const CreateProposal = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tenant } = useAuthStore();
  
  const preselectedClientId = searchParams.get('clientId');
  
  const [step, setStep] = useState(1);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>(preselectedClientId || '');
  const [selectedServices, setSelectedServices] = useState<Array<{ serviceId: string; quantity: number; discountPercent: number }>>([]);
  const [proposalTitle, setProposalTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pricing, setPricing] = useState<any>(null);

  useEffect(() => {
    loadClientsAndServices();
  }, []);

  const loadClientsAndServices = async () => {
    try {
      setIsLoading(true);
      const [clientsRes, servicesRes] = await Promise.all([
        apiClient.getClients({ limit: 100 }) as Promise<any>,
        apiClient.getServices() as Promise<any>,
      ]);

      setClients(clientsRes.data || []);
      setServices(servicesRes.data || []);
    } catch (error) {
      console.error('Failed to load data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addService = (serviceId: string) => {
    setSelectedServices([...selectedServices, { serviceId, quantity: 1, discountPercent: 0 }]);
  };

  const removeService = (index: number) => {
    setSelectedServices(selectedServices.filter((_, i) => i !== index));
  };

  const updateService = (index: number, updates: Partial<{ quantity: number; discountPercent: number }>) => {
    setSelectedServices(selectedServices.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const calculatePricing = async () => {
    try {
      const response = await apiClient.createProposal({
        clientId: selectedClient,
        title: proposalTitle,
        services: selectedServices,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }) as any;

      return response.data;
    } catch (error) {
      return null;
    }
  };

  const handleSave = async (send = false) => {
    if (!selectedClient || !proposalTitle || selectedServices.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSaving(true);
    try {
      const response = await apiClient.createProposal({
        clientId: selectedClient,
        title: proposalTitle,
        services: selectedServices,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }) as any;

      if (response.success) {
        if (send) {
          await apiClient.sendProposal(response.data.id);
          toast.success('Proposal created and sent!');
        } else {
          toast.success('Proposal saved as draft');
        }
        navigate(`/proposals/${response.data.id}`);
      }
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsSaving(false);
    }
  };

  const selectedClientData = clients.find(c => c.id === selectedClient);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/proposals"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to proposals
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4">Create Proposal</h1>
        <p className="text-sm text-gray-500">Build a professional proposal in under 5 minutes</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center">
          {[
            { id: 1, label: 'Select Client' },
            { id: 2, label: 'Add Services' },
            { id: 3, label: 'Review & Send' },
          ].map((s, index) => (
            <div key={s.id} className="flex items-center flex-1">
              <button
                onClick={() => setStep(s.id)}
                className={`flex items-center ${step >= s.id ? 'text-primary-600' : 'text-gray-400'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step > s.id ? 'bg-primary-600 text-white' :
                  step === s.id ? 'bg-primary-100 text-primary-700 border-2 border-primary-600' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {step > s.id ? <CheckIcon className="h-5 w-5" /> : s.id}
                </div>
                <span className="ml-2 text-sm font-medium hidden sm:block">{s.label}</span>
              </button>
              {index < 2 && (
                <div className={`flex-1 h-0.5 mx-4 ${step > s.id ? 'bg-primary-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Select Client */}
      {step === 1 && (
        <div className="card p-6 animate-fade-in">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select a Client</h2>
          
          {clients.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">You don't have any clients yet.</p>
              <Link to="/clients/new" className="btn-primary">
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Your First Client
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClient(client.id)}
                    className={`p-4 border-2 rounded-lg text-left transition-colors ${
                      selectedClient === client.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{client.name}</p>
                    <p className="text-sm text-gray-500">{client.companyType?.replace(/_/g, ' ')}</p>
                  </button>
                ))}
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedClient}
                  className="btn-primary disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Add Services */}
      {step === 2 && (
        <div className="space-y-6 animate-fade-in">
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Proposal Title</h2>
            <input
              type="text"
              value={proposalTitle}
              onChange={(e) => setProposalTitle(e.target.value)}
              className="input-field"
              placeholder="e.g., Annual Accounting Services 2024/25"
            />
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Services</h2>
              <span className="text-sm text-gray-500">
                {selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''} selected
              </span>
            </div>

            {/* Selected Services */}
            {selectedServices.length > 0 && (
              <div className="space-y-3 mb-6">
                {selectedServices.map((selected, index) => {
                  const service = services.find(s => s.id === selected.serviceId);
                  if (!service) return null;
                  
                  return (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{service.name}</p>
                        <p className="text-sm text-gray-500">£{service.basePrice} base price</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <label className="text-sm text-gray-600">Qty:</label>
                          <input
                            type="number"
                            min="1"
                            value={selected.quantity}
                            onChange={(e) => updateService(index, { quantity: parseInt(e.target.value) || 1 })}
                            className="w-16 input-field py-1"
                          />
                        </div>
                        <button
                          onClick={() => removeService(index)}
                          className="p-1 text-red-400 hover:text-red-600"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Service Dropdown */}
            <div className="relative">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addService(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="input-field"
                defaultValue=""
              >
                <option value="">+ Add a service...</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} - £{service.basePrice}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="btn-secondary"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!proposalTitle || selectedServices.length === 0}
              className="btn-primary disabled:opacity-50"
            >
              Review Proposal
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && selectedClientData && (
        <div className="space-y-6 animate-fade-in">
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Review Your Proposal</h2>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Client:</span>
                  <p className="font-medium text-gray-900">{selectedClientData.name}</p>
                </div>
                <div>
                  <span className="text-gray-500">Title:</span>
                  <p className="font-medium text-gray-900">{proposalTitle}</p>
                </div>
                <div>
                  <span className="text-gray-500">Services:</span>
                  <p className="font-medium text-gray-900">{selectedServices.length}</p>
                </div>
                <div>
                  <span className="text-gray-500">Valid until:</span>
                  <p className="font-medium text-gray-900">
                    {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Services Summary</h3>
              <div className="space-y-2">
                {selectedServices.map((selected, index) => {
                  const service = services.find(s => s.id === selected.serviceId);
                  if (!service) return null;
                  return (
                    <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {service.name} x {selected.quantity}
                      </span>
                      <span className="font-medium text-gray-900">
                        £{(service.basePrice * selected.quantity).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="btn-secondary"
              disabled={isSaving}
            >
              Back
            </button>
            <div className="flex space-x-3">
              <button
                onClick={() => handleSave(false)}
                disabled={isSaving}
                className="btn-secondary"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={isSaving}
                className="btn-primary"
                style={{ backgroundColor: tenant?.primaryColor || '#0ea5e9' }}
              >
                {isSaving ? 'Sending...' : 'Send Proposal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Add missing import
import { DocumentTextIcon } from '@heroicons/react/24/outline';

export default CreateProposal;
