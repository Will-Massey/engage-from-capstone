/**
 * Proposal Builder v2 - Compact & Editable
 *
 * Key Features:
 * 1. Compact service selection - more services visible at once
 * 2. Inline editing of price, quantity, discount, and VAT
 * 3. Clear pricing display with edit capability
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
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  CalculatorIcon,
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
  isVatApplicable?: boolean;
  vatRate?: string | number;
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
  { id: 2, name: 'Add Services', description: 'Select and customise services' },
  { id: 3, name: 'Review & Send', description: 'Review and send proposal' },
];

const BILLING_FREQUENCY_LABELS: Record<string, string> = {
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  ANNUALLY: 'year',
  ONE_TIME: 'one-time',
};

const VAT_RATES = [0, 5, 20];

// Format price with frequency label
const formatPriceWithFrequency = (price: number, frequency: string): string => {
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);

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
    maximumFractionDigits: 2,
  }).format(amount);
};

// Calculate annual equivalent
const calculateAnnualEquivalent = (price: number, frequency: string): number => {
  switch (frequency) {
    case 'MONTHLY':
      return price * 12;
    case 'QUARTERLY':
      return price * 4;
    case 'ANNUALLY':
      return price;
    case 'ONE_TIME':
      return 0;
    default:
      return price * 12;
  }
};

// Calculate monthly equivalent for display
const calculateMonthlyEquivalent = (price: number, frequency: string): number => {
  switch (frequency) {
    case 'MONTHLY':
      return price;
    case 'QUARTERLY':
      return price / 4;
    case 'ANNUALLY':
      return price / 12;
    case 'ONE_TIME':
      return price;
    default:
      return price;
  }
};

// Format price for available services list (shows monthly equivalent)
const formatPriceForDisplay = (price: number, frequency: string): string => {
  if (frequency === 'ONE_TIME' || frequency === 'ANNUALLY') {
    return formatPriceWithFrequency(price, frequency);
  }
  const monthlyEquivalent = calculateMonthlyEquivalent(price, frequency);
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monthlyEquivalent);
  return `${formatted}/month`;
};

export default function ProposalBuilderV2() {
  // UNIQUE_MARKER_12345
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

  // Edit form state
  const [editForm, setEditForm] = useState<{
    displayPrice: number;
    quantity: number;
    discountPercent: number;
    vatRate: number;
    billingCycle: string;
  }>({ displayPrice: 0, quantity: 1, discountPercent: 0, vatRate: 20, billingCycle: 'MONTHLY' });

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
      const response = (await apiClient.getClients({ limit: 100 })) as any;
      setClients(response.data || []);
    } catch (error) {
      toast.error('Failed to load clients');
    }
  };

  const loadServices = async () => {
    try {
      const response = (await apiClient.getServices({ limit: 100 })) as any;
      const mappedServices = (response.data || []).map((s: any) => {
        const derivedBillingCycle =
          s.defaultFrequency && s.defaultFrequency !== 'MONTHLY'
            ? s.defaultFrequency === 'ONE_TIME'
              ? 'MONTHLY'
              : s.defaultFrequency
            : s.billingCycle || 'MONTHLY';
        return {
          ...s,
          priceAmount: s.priceAmount || s.basePrice || 0,
          billingCycle: derivedBillingCycle,
        };
      });
      setServices(mappedServices);
    } catch (error) {
      toast.error('Failed to load services');
    }
  };

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(services.map((s) => s.category).filter(Boolean));
    return ['ALL', ...Array.from(cats)];
  }, [services]);

  // Filter services
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesCategory = selectedCategory === 'ALL' || s.category === selectedCategory;
      const matchesSearch = s.name.toLowerCase().includes((serviceSearch || '').toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [services, selectedCategory, serviceSearch]);

  // Helper to compute live preview values for a service being edited
  const getEditingPreview = (original: SelectedService): SelectedService => {
    const quantity = editForm.quantity || 1;
    const discount = editForm.discountPercent || 0;
    const price = editForm.displayPrice || 0;
    const vatRate = editForm.vatRate || 0;

    const grossLineTotal = price * quantity;
    const discountAmount = grossLineTotal * (discount / 100);
    const lineTotal = grossLineTotal - discountAmount;
    const vatAmount = includeVat ? Math.round(lineTotal * (vatRate / 100) * 100) / 100 : 0;

    return {
      ...original,
      displayPrice: price,
      quantity,
      discountPercent: discount,
      vatRate,
      billingCycle: editForm.billingCycle,
      lineTotal,
      vatAmount,
      grossTotal: lineTotal + vatAmount,
      annualEquivalent: calculateAnnualEquivalent(price, editForm.billingCycle),
    };
  };

  // Calculate summary (includes live preview of editing service)
  // All recurring totals are normalized to monthly equivalents for easy comparison
  const summary: PricingSummary = useMemo(() => {
    const servicesForSummary = editingService
      ? selectedServices.map((s) => (s.id === editingService ? getEditingPreview(s) : s))
      : selectedServices;

    const monthly = servicesForSummary.filter((s) => s.billingCycle === 'MONTHLY');
    const quarterly = servicesForSummary.filter((s) => s.billingCycle === 'QUARTERLY');
    const annually = servicesForSummary.filter((s) => s.billingCycle === 'ANNUALLY');
    const oneTime = servicesForSummary.filter((s) => s.billingCycle === 'ONE_TIME');

    const calcGroupMonthly = (items: SelectedService[], divisor: number = 1) => ({
      subtotal: items.reduce((sum, s) => sum + s.lineTotal / divisor, 0),
      vat: items.reduce((sum, s) => sum + s.vatAmount / divisor, 0),
      total: items.reduce((sum, s) => sum + s.grossTotal / divisor, 0),
      count: items.length,
    });

    const monthlyGroup = calcGroupMonthly(monthly, 1);
    const quarterlyGroup = calcGroupMonthly(quarterly, 4);
    const annualGroup = calcGroupMonthly(annually, 12);
    const oneTimeGroup = calcGroupMonthly(oneTime, 1);

    const totalAnnualEquivalent =
      monthly.reduce((sum, s) => sum + s.annualEquivalent * s.quantity, 0) +
      quarterly.reduce((sum, s) => sum + s.annualEquivalent * s.quantity, 0) +
      annually.reduce((sum, s) => sum + s.annualEquivalent * s.quantity, 0);

    return {
      monthly: monthlyGroup,
      quarterly: quarterlyGroup,
      annually: annualGroup,
      oneTime: oneTimeGroup,
      grandTotal:
        monthlyGroup.total + quarterlyGroup.total + annualGroup.total + oneTimeGroup.total,
      totalAnnualEquivalent,
    };
  }, [selectedServices, editingService, editForm, includeVat]);

  // Add service
  const addService = (service: Service) => {
    if (selectedServices.find((s) => s.id === service.id)) {
      toast.success('Service already added');
      return;
    }

    const price = service.priceAmount || 0;
    const frequency = service.billingCycle || 'MONTHLY';
    const annualEquivalent = calculateAnnualEquivalent(price, frequency);
    const lineTotal = price;

    const vatPercent =
      service.isVatApplicable !== false
        ? service.vatRate === 'REDUCED_5'
          ? 5
          : service.vatRate === 'ZERO' || service.vatRate === 'EXEMPT'
            ? 0
            : 20
        : 0;
    const vatAmount = includeVat ? Math.round(lineTotal * (vatPercent / 100) * 100) / 100 : 0;

    const newService: SelectedService = {
      ...service,
      quantity: 1,
      discountPercent: 0,
      displayPrice: price,
      annualEquivalent,
      lineTotal,
      vatRate: vatPercent,
      vatAmount,
      grossTotal: lineTotal + vatAmount,
    };

    setSelectedServices([...selectedServices, newService]);
    toast.success(`${service.name} added`);
  };

  // Start editing service
  const startEdit = (service: SelectedService) => {
    setEditingService(service.id);
    setEditForm({
      displayPrice: service.displayPrice,
      quantity: service.quantity,
      discountPercent: service.discountPercent,
      vatRate: service.vatRate,
      billingCycle: service.billingCycle,
    });
  };

  // Save edit
  const saveEdit = (id: string) => {
    setSelectedServices((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;

        const quantity = editForm.quantity || 1;
        const discount = editForm.discountPercent || 0;
        const price = editForm.displayPrice || 0;
        const vatRate = editForm.vatRate || 0;

        // Recalculate
        const grossLineTotal = price * quantity;
        const discountAmount = grossLineTotal * (discount / 100);
        const lineTotal = grossLineTotal - discountAmount;
        const vatAmount = includeVat ? Math.round(lineTotal * (vatRate / 100) * 100) / 100 : 0;

        return {
          ...s,
          displayPrice: price,
          quantity,
          discountPercent: discount,
          vatRate,
          billingCycle: editForm.billingCycle,
          lineTotal,
          vatAmount,
          grossTotal: lineTotal + vatAmount,
          annualEquivalent: calculateAnnualEquivalent(price, editForm.billingCycle),
        };
      })
    );
    setEditingService(null);
    toast.success('Service updated');
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingService(null);
  };

  // Remove service
  const removeService = (id: string) => {
    setSelectedServices((prev) => prev.filter((s) => s.id !== id));
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
      const servicesData = selectedServices.map((s) => ({
        serviceId: s.id,
        displayPrice: s.displayPrice,
        billingFrequency: s.billingCycle,
        quantity: s.quantity,
        discountPercent: s.discountPercent,
        vatRate: includeVat ? s.vatRate : 0,
      }));

      const proposalData = {
        clientId: selectedClient.id,
        title: proposalTitle,
        services: servicesData,
        coverLetter:
          coverLetter ||
          `Dear ${selectedClient.name},\n\nThank you for considering our services...`,
      };

      const response = (await apiClient.createProposal(proposalData)) as any;

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
          <div
            className={`flex flex-col items-center ${currentStep >= step.id ? 'cursor-pointer' : ''}`}
            onClick={() => currentStep > step.id && setCurrentStep(step.id)}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
                currentStep === step.id
                  ? 'bg-primary-600 text-white'
                  : currentStep > step.id
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {currentStep > step.id ? <CheckIcon className="w-5 h-5" /> : step.id}
            </div>
            <span
              className={`text-xs mt-2 ${currentStep === step.id ? 'text-primary-600 font-medium' : 'text-slate-500'}`}
            >
              {step.name}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div
              className={`w-16 h-0.5 mx-2 ${currentStep > step.id ? 'bg-green-500' : 'bg-slate-200'}`}
            />
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
        <MagnifyingGlassIcon className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients
          .filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
          .map((client) => (
            <div
              key={client.id}
              data-testid="client-card"
              data-client-name={client.name}
              onClick={() => setSelectedClient(client)}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                selectedClient?.id === client.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <h3 className="font-semibold text-slate-900 dark:text-white">{client.name}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{client.companyType}</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">{client.contactEmail}</p>
            </div>
          ))}
      </div>

      {selectedClient && (
        <div className="flex justify-end">
          <button data-testid="client-continue-button" onClick={() => setCurrentStep(2)} className="btn-primary">
            Continue
            <ArrowRightIcon className="w-5 h-5 ml-2" />
          </button>
        </div>
      )}
    </div>
  );

  // Render compact service row
  const renderServiceRow = (service: Service) => {
    const isSelected = selectedServices.find((s) => s.id === service.id);

    return (
      <div
        key={service.id}
        data-testid="available-service-row"
        data-service-name={service.name}
        onClick={() => !isSelected && addService(service)}
        className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${
          isSelected
            ? 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700'
            : 'bg-white border-slate-200 hover:border-primary-300 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:border-primary-600'
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-slate-900 dark:text-white truncate">{service.name}</h3>
            {isSelected && <CheckIcon className="w-4 h-4 text-green-600 flex-shrink-0" />}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{service.category}</p>
        </div>
        <div className="text-right flex-shrink-0 ml-4">
          <span className="font-semibold text-primary-600 text-sm">
            {formatPriceForDisplay(service.priceAmount, service.billingCycle)}
          </span>
        </div>
      </div>
    );
  };

  // Render editable selected service row
  const renderSelectedServiceRow = (service: SelectedService) => {
    const isEditing = editingService === service.id;

    if (isEditing) {
      return (
        <div
          key={service.id}
          className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-900 dark:text-white text-sm">{service.name}</h4>
            <div className="flex gap-1">
              <button
                data-testid="save-edit-button"
                onClick={() => saveEdit(service.id)}
                className="p-1 text-green-600 hover:bg-green-100 rounded"
              >
                <CheckIcon className="w-4 h-4" />
              </button>
              <button data-testid="cancel-edit-button" onClick={cancelEdit} className="p-1 text-red-600 hover:bg-red-100 rounded">
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {/* Price */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Price (£)</label>
              <input
                data-testid="edit-price-input"
                type="number"
                value={editForm.displayPrice}
                onChange={(e) => setEditForm({ ...editForm, displayPrice: Number(e.target.value) })}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              />
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Qty</label>
              <input
                type="number"
                min={1}
                value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              />
            </div>

            {/* Discount */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Disc %</label>
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.discountPercent}
                onChange={(e) =>
                  setEditForm({ ...editForm, discountPercent: Number(e.target.value) })
                }
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              />
            </div>

            {/* VAT Rate */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">VAT %</label>
              <select
                data-testid="edit-vat-select"
                value={editForm.vatRate}
                onChange={(e) => setEditForm({ ...editForm, vatRate: Number(e.target.value) })}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              >
                {VAT_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </select>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">Freq</label>
              <select
                data-testid="edit-frequency-select"
                value={editForm.billingCycle}
                onChange={(e) => setEditForm({ ...editForm, billingCycle: e.target.value })}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-800 dark:border-slate-600"
              >
                <option value="MONTHLY">Mo</option>
                <option value="QUARTERLY">Qtr</option>
                <option value="ANNUALLY">Yr</option>
                <option value="ONE_TIME">1x</option>
              </select>
            </div>
          </div>

          {/* Live preview */}
          <div className="flex justify-between items-center pt-1 border-t border-amber-200 dark:border-amber-800">
            <span className="text-xs text-slate-500">Preview:</span>
            <span className="font-semibold text-primary-600 text-sm">
              {formatCurrency(
                editForm.displayPrice *
                  editForm.quantity *
                  (1 - editForm.discountPercent / 100) *
                  (1 + (includeVat ? editForm.vatRate : 0) / 100)
              )}
              <span className="text-xs text-slate-500 font-normal ml-1">
                /{BILLING_FREQUENCY_LABELS[editForm.billingCycle] || 'month'}
              </span>
            </span>
          </div>
        </div>
      );
    }

    // Compact view mode
    return (
      <div data-testid="selected-service-row" data-service-name={service.name} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg group hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-slate-900 dark:text-white text-sm truncate">
            {service.name}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {service.billingCycle === 'ONE_TIME' || service.billingCycle === 'ANNUALLY'
              ? `${formatCurrency(service.displayPrice)} × ${service.quantity}`
              : `${formatCurrency(calculateMonthlyEquivalent(service.displayPrice, service.billingCycle))} × ${service.quantity}`}
            {service.discountPercent > 0 && (
              <span className="text-amber-600 ml-1">(-{service.discountPercent}%)</span>
            )}
            {service.vatRate !== 20 && (
              <span className="text-blue-600 ml-1">({service.vatRate}% VAT)</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <div className="text-right">
            <span className="font-semibold text-slate-900 dark:text-white text-sm block">
              {service.billingCycle === 'ONE_TIME' || service.billingCycle === 'ANNUALLY'
                ? formatCurrency(service.lineTotal)
                : formatCurrency(calculateMonthlyEquivalent(service.lineTotal, service.billingCycle))}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {service.billingCycle === 'ONE_TIME' || service.billingCycle === 'ANNUALLY'
                ? BILLING_FREQUENCY_LABELS[service.billingCycle] || 'one-time'
                : 'month'}
              {service.vatAmount > 0 && (
                <span className="ml-1 text-primary-500 dark:text-primary-400">
                  (inc VAT {formatCurrency(service.grossTotal)})
                </span>
              )}
            </span>
          </div>

          <div className="flex gap-1">
            <button
              data-testid="edit-service-button"
              onClick={() => startEdit(service)}
              className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
              title="Edit"
            >
              <PencilIcon className="w-4 h-4" />
            </button>
            <button
              data-testid="remove-service-button"
              onClick={() => removeService(service.id)}
              className="p-1.5 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
              title="Remove"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render Step 2: Services
  const renderServicesStep = () => (
    <div className="space-y-6">
      {/* Header with search */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Add Services</h2>
        <div className="relative">
          <input
            type="text"
            placeholder="Search services..."
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
            className="input-field w-full md:w-64 pl-10"
          />
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
        </div>
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              selectedCategory === cat
                ? 'bg-primary-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {cat === 'ALL' ? 'All Categories' : cat}
          </button>
        ))}
      </div>

      {/* Two-column layout: Available Services | Selected Services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Services - Compact List */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
            Available ({filteredServices.length})
          </h3>
          <div className="max-h-[500px] overflow-y-auto space-y-1 pr-1">
            {filteredServices.map(renderServiceRow)}
          </div>
        </div>

        {/* Selected Services */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
            Selected ({selectedServices.length})
          </h3>

          {selectedServices.length === 0 ? (
            <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              <CalculatorIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Click services from the left to add them</p>
            </div>
          ) : (
            <>
              <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
                {selectedServices.map(renderSelectedServiceRow)}
              </div>

              {/* Running Total */}
              <div className="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-100 dark:border-primary-800">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Subtotal</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {formatCurrency(
                      summary.monthly.subtotal +
                        summary.quarterly.subtotal +
                        summary.annually.subtotal +
                        summary.oneTime.subtotal
                    )}
                  </span>
                </div>
                {includeVat && (
                  <div className="flex justify-between items-center text-sm mt-1">
                    <span className="text-slate-600 dark:text-slate-300">VAT</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {formatCurrency(
                        summary.monthly.vat +
                          summary.quarterly.vat +
                          summary.annually.vat +
                          summary.oneTime.vat
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-primary-200 dark:border-primary-800">
                  <span className="font-semibold text-slate-900 dark:text-white">Total monthly</span>
                  <span className="text-lg font-bold text-primary-600">
                    {formatCurrency(
                      summary.monthly.total + summary.quarterly.total + summary.annually.total
                    )}
                    <span className="text-xs font-normal text-slate-500 ml-1">/month</span>
                  </span>
                </div>
                {summary.oneTime.count > 0 && (
                  <div className="flex justify-between items-center mt-1 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">One-time</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {formatCurrency(summary.oneTime.total)}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
        <button data-testid="services-back-button" onClick={() => setCurrentStep(1)} className="btn-secondary">
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back
        </button>
        {selectedServices.length > 0 && (
          <button data-testid="services-continue-button" onClick={() => setCurrentStep(3)} className="btn-primary">
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

      {/* Proposal Title */}
      <div className="card p-4 border-2 border-primary-200 dark:border-primary-800 bg-primary-50/30 dark:bg-primary-900/10">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
          Proposal Title *
        </label>
        <input
          data-testid="proposal-title-input"
          type="text"
          value={proposalTitle}
          onChange={(e) => setProposalTitle(e.target.value)}
          placeholder="e.g., Accounting Services 2026"
          className="input-field w-full text-lg font-medium"
        />
      </div>

      {/* Client Summary */}
      <div className="card p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Client</h3>
        <p className="text-slate-700 dark:text-slate-200">{selectedClient?.name}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{selectedClient?.contactEmail}</p>
      </div>

      {/* Services Summary */}
      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Services</h3>

        {['MONTHLY', 'QUARTERLY', 'ANNUALLY', 'ONE_TIME'].map((freq) => {
          const items = selectedServices.filter((s) => s.billingCycle === freq);
          if (items.length === 0) return null;

          const totals = items.reduce(
            (acc, s) => ({
              subtotal: acc.subtotal + s.lineTotal,
              vat: acc.vat + s.vatAmount,
              total: acc.total + s.grossTotal,
            }),
            { subtotal: 0, vat: 0, total: 0 }
          );

          return (
            <div key={freq} className="mb-4">
              <h4 className="text-sm font-medium text-primary-600 mb-2 capitalize">
                {freq.replace('_', ' ').toLowerCase()}
              </h4>
              {items.map(renderSelectedServiceRow)}
              <div className="flex justify-between pt-2 border-t border-slate-100 mt-2">
                <span className="text-slate-600 dark:text-slate-300 capitalize">
                  {BILLING_FREQUENCY_LABELS[freq]} Total
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatCurrency(totals.total)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Grand Total */}
        <div className="mt-6 pt-4 border-t-2 border-slate-200">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-slate-900 dark:text-white">
              Total Investment
            </span>
            <span className="text-2xl font-bold text-primary-600">
              {formatCurrency(summary.grandTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <button data-testid="review-back-button" onClick={() => setCurrentStep(2)} className="btn-secondary">
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Back
        </button>
        <button data-testid="create-proposal-button" onClick={createProposal} disabled={isLoading} className="btn-primary">
          {isLoading ? 'Creating...' : 'Create Proposal'}
          <ArrowRightIcon className="w-5 h-5 ml-2" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto">
      {renderStepIndicator()}

      <div className="animate-fade-in">
        {currentStep === 1 && renderClientStep()}
        {currentStep === 2 && renderServicesStep()}
        {currentStep === 3 && renderReviewStep()}
      </div>
    </div>
  );
}
// TEST COMMENT FOR BUILD
// FORCE REBUILD Sat Apr 11 10:26:46 BST 2026
export const BUILD_TIMESTAMP = 'Sat Apr 11 10:32:40 BST 2026';
