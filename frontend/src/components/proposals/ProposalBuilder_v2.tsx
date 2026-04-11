/**
 * Proposal Builder v2 - Clear and Intuitive Pricing
 * 
 * Key Features:
 * 1. Prices shown as they are (£850/year shows as £850/year)
 * 2. No confusing conversions
 * 3. Grouped totals by billing frequency
 * 4. Clear annual equivalent for comparison
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  DocumentDuplicateIcon,
  CalculatorIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// Types
interface Client {
  id: string;
  name: string;
  companyType: string;
  contactEmail: string;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  priceAmount: number;
  priceDisplayMode: 'PER_MONTH' | 'PER_QUARTER' | 'PER_YEAR' | 'ONE_TIME';
  billingCycle: string;
  category: string;
}

interface SelectedService extends Service {
  quantity: number;
  discountPercent: number;
  displayPrice: number;
  annualEquivalent: number;
  lineTotal: number;
  vatRate: number;
  vatAmount: number;
  grossTotal: number;
}

interface PricingSummary {
  monthly: { subtotal: number; vat: number; total: number; count: number };
  quarterly: { subtotal: number; vat: number; total: number; count: number };
  annually: { subtotal: number; vat: number; total: number; count: number };
  oneTime: { subtotal: number; vat: number; total: number; count: number };
  grandTotal: number;
  totalAnnualEquivalent: number;
}

const STEPS = [
  { id: 1, name: 'Select Client', description: 'Choose who this proposal is for' },
  { id: 2, name: 'Add Services', description: 'Select and customize services' },
  { id: 3, name: 'Review & Send', description: 'Review and send proposal' },
];

const BILLING_FREQUENCY_LABELS: Record<string, string> = {
  'MONTHLY': 'month',
  'QUARTERLY': 'quarter',
  'ANNUALLY': 'year',
  'ONE_TIME': 'one-time',
};

// Format price with frequency label
// Prices in DB are annual - divide by 12 for monthly display, round to nearest £25
const formatPriceWithFrequency = (price: number, frequency: string): string => {
  // Convert annual price to monthly and round to nearest £25
  const monthlyPrice = Math.round((price / 12) / 25) * 25;
  
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(monthlyPrice);
  
  const label = BILLING_FREQUENCY_LABELS[frequency] || '';
  if (frequency === 'ONE_TIME') {
    return `${formatted} ${label}`;
  }
  return `${formatted}/${label}`;
};

// Format currency only
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
};

// Calculate annual equivalent
const calculateAnnualEquivalent = (price: number, frequency: string): number => {
  switch (frequency) {
    case 'MONTHLY': return price * 12;
    case 'QUARTERLY': return price * 4;
    case 'ANNUALLY': return price;
    case 'ONE_TIME': return 0;
    default: return price * 12;
  }
};

export default function ProposalBuilderV2() {
  const navigate = useNavigate();
  const { tenant } = useAuthStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Step 1: Client
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  
  // Step 2: Services
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [editingService, setEditingService] = useState<string | null>(null);
  
  // Step 3: Review
  const [proposalTitle, setProposalTitle] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [includeVat, setIncludeVat] = useState(true);
  
  // Load data
  useEffect(() => {
    loadClients();
    loadServices();
  }, []);
  
  const loadClients = async () => {
    try {
      const response = await apiClient.getClients({ limit: 100 }) as any;
      setClients(response.data || []);
    } catch (error) {
      toast.error('Failed to load clients');
    }
  };
  
  const loadServices = async () => {
    try {
      const response = await apiClient.getServices({ limit: 100 }) as any;
      // Map legacy fields to new clear pricing fields
      const mappedServices = (response.data || []).map((s: any) => ({
        ...s,
        priceAmount: s.priceAmount || s.basePrice || 0,
        billingCycle: s.billingCycle || s.defaultFrequency || 'MONTHLY',
      }));
      setServices(mappedServices);
    } catch (error) {
      toast.error('Failed to load services');
    }
  };
  
  // Filter services
  const filteredServices = useMemo(() => {
    return services.filter(s => {
      const matchesCategory = selectedCategory === 'ALL' || s.category === selectedCategory;
      const matchesSearch = s.name.toLowerCase().includes((serviceSearch || '').toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [services, selectedCategory, serviceSearch]);
  
  // Calculate summary
  const summary: PricingSummary = useMemo(() => {
    const monthly = selectedServices.filter(s => s.billingCycle === 'MONTHLY');
    const quarterly = selectedServices.filter(s => s.billingCycle === 'QUARTERLY');
    const annually = selectedServices.filter(s => s.billingCycle === 'ANNUALLY');
    const oneTime = selectedServices.filter(s => s.billingCycle === 'ONE_TIME');
    
    const calcGroup = (items: SelectedService[]) => ({
      subtotal: items.reduce((sum, s) => sum + s.lineTotal, 0),
      vat: items.reduce((sum, s) => sum + s.vatAmount, 0),
      total: items.reduce((sum, s) => sum + s.grossTotal, 0),
      count: items.length,
    });
    
    const monthlyGroup = calcGroup(monthly);
    const quarterlyGroup = calcGroup(quarterly);
    const annualGroup = calcGroup(annually);
    const oneTimeGroup = calcGroup(oneTime);
    
    const totalAnnualEquivalent = 
      monthly.reduce((sum, s) => sum + s.annualEquivalent * s.quantity, 0) +
      quarterly.reduce((sum, s) => sum + s.annualEquivalent * s.quantity, 0) +
      annually.reduce((sum, s) => sum + s.annualEquivalent * s.quantity, 0);
    
    return {
      monthly: monthlyGroup,
      quarterly: quarterlyGroup,
      annually: annualGroup,
      oneTime: oneTimeGroup,
      grandTotal: monthlyGroup.total + quarterlyGroup.total + annualGroup.total + oneTimeGroup.total,
      totalAnnualEquivalent,
    };
  }, [selectedServices]);
  
  // Add service
  const addService = (service: Service) => {
    if (selectedServices.find(s => s.id === service.id)) {
      toast.success('Service already added');
      return;
    }
    
    const price = service.priceAmount || 0;
    const frequency = service.billingCycle || 'MONTHLY';
    const annualEquivalent = calculateAnnualEquivalent(price, frequency);
    const lineTotal = price;
    const vatAmount = includeVat ? Math.round(lineTotal * 0.2 * 100) / 100 : 0;
    
    const newService: SelectedService = {
      ...service,
      quantity: 1,
      discountPercent: 0,
      displayPrice: price,
      annualEquivalent,
      lineTotal,
      vatRate: 20,
      vatAmount,
      grossTotal: lineTotal + vatAmount,
    };
    
    setSelectedServices([...selectedServices, newService]);
    toast.success(`${service.name} added`);
  };
  
  // Update service
  const updateService = (id: string, updates: Partial<SelectedService>) => {
    setSelectedServices(prev => prev.map(s => {
      if (s.id !== id) return s;
      
      const updated = { ...s, ...updates };
      const quantity = updated.quantity || 1;
      const discount = updated.discountPercent || 0;
      
      // Recalculate
      const grossLineTotal = updated.displayPrice * quantity;
      const discountAmount = grossLineTotal * (discount / 100);
      const lineTotal = grossLineTotal - discountAmount;
      const vatAmount = includeVat ? Math.round(lineTotal * 0.2 * 100) / 100 : 0;
      
      updated.lineTotal = lineTotal;
      updated.vatAmount = vatAmount;
      updated.grossTotal = lineTotal + vatAmount;
      updated.annualEquivalent = calculateAnnualEquivalent(updated.displayPrice, updated.billingCycle);
      
      return updated;
    }));
  };
  
  // Remove service
  const removeService = (id: string) => {
    setSelectedServices(prev => prev.filter(s => s.id !== id));
  };
  
  // Create proposal
  const createProposal = async () => {
    if (!selectedClient) {
      toast.error('Please select a client');
      return;
    }
    if (selectedServices.length === 0) {
      toast.error('Please add at least one service');
      return;
    }
    if (!proposalTitle) {
      toast.error('Please enter a proposal title');
      return;
    }
    
    setIsLoading(true);
    try {
      const servicesData = selectedServices.map(s => ({
        serviceId: s.id,
        displayPrice: s.displayPrice,
        billingFrequency: s.billingCycle,
        quantity: s.quantity,
        discountPercent: s.discountPercent,
        vatRate: includeVat ? 20 : 0,
      }));
      
      const proposalData = {
        clientId: selectedClient.id,
        title: proposalTitle,
        services: servicesData,
        coverLetter: coverLetter || `Dear ${selectedClient.name},\n\nThank you for considering our services...`,
      };
      
      const response = await apiClient.createProposal(proposalData) as any;
      
      if (response.success) {
        toast.success('Proposal created successfully!');
        navigate(`/proposals/${response.data.id}`);
      } else {
        toast.error(response.error?.message || 'Failed to create proposal');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create proposal');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Render step indicator
  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div className={`flex flex-col items-center ${currentStep >= step.id ? 'cursor-pointer' : ''}`} 
               onClick={() => currentStep > step.id && setCurrentStep(step.id)}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
              currentStep === step.id 
                ? 'bg-primary-600 text-white' 
                : currentStep > step.id 
                  ? 'bg-green-500 text-white'
                  : 'bg-slate-200 text-slate-500'
            }`}>
              {currentStep > step.id ? <CheckIcon className="w-5 h-5" /> : step.id}
            </div>
            <span className={`text-xs mt-2 ${currentStep === step.id ? 'text-primary-600 font-medium' : 'text-slate-500'}`}>
              {step.name}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div className={`w-16 h-0.5 mx-2 ${currentStep > step.id ? 'bg-green-500' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
  
  // Render Step 1: Client Selection
  const renderClientStep = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Select a Client</h2>
      
      <div className="relative">
        <input
          type="text"
          placeholder="Search clients..."
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
        <PlusIcon className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 dark:text-slate-500" />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients
          .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
          .map(client => (
          <div
            key={client.id}
            onClick={() => setSelectedClient(client)}
            className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedClient?.id === client.id
                ? 'border-primary-500 bg-primary-50'
                : 'border-slate-200 hover:border-primary-300 hover:bg-slate-50'
            }`}
          >
            <h3 className="font-semibold text-slate-900 dark:text-white">{client.name}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{client.companyType}</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">{client.contactEmail}</p>
          </div>
        ))}
      </div>
      
      {selectedClient && (
        <div className="flex justify-end">
          <button
            onClick={() => setCurrentStep(2)}
            className="btn-primary"
          >
            Continue
            <ArrowRightIcon className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}
    </div>
  );
  
  // Render Step 2: Services
  const renderServicesStep = () => (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Add Services</h2>
        <input
          type="text"
          placeholder="Search services..."
          value={serviceSearch}
          onChange={(e) => setServiceSearch(e.target.value)}
          className="input-field w-full md:w-64"
        />
      </div>
      
      {/* Available Services */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredServices.map(service => (
          <div
            key={service.id}
            onClick={() => addService(service)}
            className="glass-tile cursor-pointer hover:border-primary-300 group"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-primary-600 transition-colors">
                {service.name}
              </h3>
              <PlusIcon className="w-5 h-5 text-slate-400 dark:text-slate-300 group-hover:text-primary-500" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-300 mb-3 line-clamp-2">{service.description}</p>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-primary-600">
                {formatPriceWithFrequency(service.priceAmount, service.billingCycle)}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full">
                {service.category}
              </span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Selected Services */}
      {selectedServices.length > 0 && (
        <div className="card p-6 mt-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Selected Services</h3>
          <div className="space-y-3">
            {selectedServices.map(service => (
              <div key={service.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium text-slate-900 dark:text-white">{service.name}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {formatPriceWithFrequency(service.displayPrice, service.billingCycle)}
                    {service.quantity > 1 && ` × ${service.quantity}`}
                    {service.discountPercent > 0 && ` (-${service.discountPercent}%)`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <span className="font-semibold text-slate-900 block">
                      {formatPriceWithFrequency(service.lineTotal, service.billingCycle)}
                    </span>
                    {includeVat && service.vatAmount > 0 && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        + VAT {formatCurrency(service.vatAmount)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => removeService(service.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {/* Running Total */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="flex justify-between items-center">
              <span className="text-slate-600 dark:text-slate-300">Subtotal</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {formatCurrency(summary.monthly.subtotal + summary.quarterly.subtotal + summary.annually.subtotal + summary.oneTime.subtotal)}
              </span>
            </div>
            {includeVat && (
              <div className="flex justify-between items-center mt-1">
                <span className="text-slate-600 dark:text-slate-300">VAT (20%)</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(summary.monthly.vat + summary.quarterly.vat + summary.annually.vat + summary.oneTime.vat)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200">
              <span className="text-lg font-semibold text-slate-900 dark:text-white">Total</span>
              <span className="text-xl font-bold text-primary-600">
                {formatCurrency(summary.grandTotal)}
              </span>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex justify-between">
        <button onClick={() => setCurrentStep(1)} className="btn-secondary">
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back
        </button>
        {selectedServices.length > 0 && (
          <button onClick={() => setCurrentStep(3)} className="btn-primary">
            Continue
            <ArrowRightIcon className="w-5 h-5 ml-2" />
          </button>
        )}
      </div>
    </div>
  );
  
  // Render Step 3: Review
  const renderReviewStep = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Review & Send</h2>
      
      {/* Proposal Title - Made more prominent */}
      <div className="card p-4 border-2 border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Proposal Title *</label>
        <input
          type="text"
          value={proposalTitle}
          onChange={(e) => setProposalTitle(e.target.value)}
          placeholder="e.g., Accounting Services 2026"
          className="input-field w-full text-lg font-medium"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">This will appear as the subject line in the email to your client</p>
      </div>
      
      {/* Client Summary */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Client</h3>
        <p className="text-slate-700 dark:text-slate-200">{selectedClient?.name}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">{selectedClient?.contactEmail}</p>
      </div>
      
      {/* Services Summary with Clear Grouping */}
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Services</h3>
        
        {/* Monthly Services */}
        {summary.monthly.count > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-primary-600 mb-2">Monthly</h4>
            {selectedServices.filter(s => s.billingCycle === 'MONTHLY').map(s => (
              <div key={s.id} className="flex justify-between py-1 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{s.name} {s.quantity > 1 && `× ${s.quantity}`}</span>
                <span className="text-slate-900 dark:text-white">{formatPriceWithFrequency(s.displayPrice * s.quantity, 'MONTHLY')}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-slate-100 mt-2">
              <span className="text-slate-600 dark:text-slate-300">Monthly Total</span>
              <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(summary.monthly.total)}/month</span>
            </div>
          </div>
        )}
        
        {/* Quarterly Services */}
        {summary.quarterly.count > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-primary-600 mb-2">Quarterly</h4>
            {selectedServices.filter(s => s.billingCycle === 'QUARTERLY').map(s => (
              <div key={s.id} className="flex justify-between py-1 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{s.name} {s.quantity > 1 && `× ${s.quantity}`}</span>
                <span className="text-slate-900 dark:text-white">{formatPriceWithFrequency(s.displayPrice * s.quantity, 'QUARTERLY')}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-slate-100 mt-2">
              <span className="text-slate-600 dark:text-slate-300">Quarterly Total</span>
              <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(summary.quarterly.total)}/quarter</span>
            </div>
          </div>
        )}
        
        {/* Annual Services */}
        {summary.annually.count > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-primary-600 mb-2">Annual</h4>
            {selectedServices.filter(s => s.billingCycle === 'ANNUALLY').map(s => (
              <div key={s.id} className="flex justify-between py-1 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{s.name} {s.quantity > 1 && `× ${s.quantity}`}</span>
                <span className="text-slate-900 dark:text-white">{formatPriceWithFrequency(s.displayPrice * s.quantity, 'ANNUALLY')}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-slate-100 mt-2">
              <span className="text-slate-600 dark:text-slate-300">Annual Total</span>
              <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(summary.annually.total)}/year</span>
            </div>
          </div>
        )}
        
        {/* One-Time Services */}
        {summary.oneTime.count > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-primary-600 mb-2">One-Time</h4>
            {selectedServices.filter(s => s.billingCycle === 'ONE_TIME').map(s => (
              <div key={s.id} className="flex justify-between py-1 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{s.name} {s.quantity > 1 && `× ${s.quantity}`}</span>
                <span className="text-slate-900 dark:text-white">{formatCurrency(s.grossTotal)}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Grand Total */}
        <div className="mt-6 pt-4 border-t-2 border-slate-200">
          <div className="flex justify-between items-center">
            <div>
              <span className="text-lg font-semibold text-slate-900 dark:text-white">Total Investment</span>
              {summary.totalAnnualEquivalent > 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {formatCurrency(summary.totalAnnualEquivalent)}/year when annualized
                </p>
              )}
            </div>
            <span className="text-2xl font-bold text-primary-600">
              {formatCurrency(summary.grandTotal)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex justify-between">
        <button onClick={() => setCurrentStep(2)} className="btn-secondary">
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back
        </button>
        <button 
          onClick={createProposal} 
          disabled={isLoading}
          className="btn-primary"
        >
          {isLoading ? 'Creating...' : 'Create Proposal'}
          <ArrowRightIcon className="w-5 h-5 ml-2" />
        </button>
      </div>
    </div>
  );
  
  return (
    <div className="max-w-5xl mx-auto">
      {renderStepIndicator()}
      
      <div className="animate-fade-in">
        {currentStep === 1 && renderClientStep()}
        {currentStep === 2 && renderServicesStep()}
        {currentStep === 3 && renderReviewStep()}
      </div>
    </div>
  );
}
