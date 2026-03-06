import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  BuildingOfficeIcon,
  CheckIcon,
  TrashIcon,
  PencilIcon,
  DocumentDuplicateIcon,
  CalculatorIcon,
  XMarkIcon,
  ChevronDownIcon,
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
  basePrice: number;
  category: string;
  billingCycle: string;
}

interface SelectedService extends Service {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;  // Per-line VAT rate
  total: number;    // Net total
  vatAmount: number; // VAT amount for this line
  grossTotal: number; // Total including VAT
  serviceTemplateId: string; // Original service ID for backend
}

interface ProposalSummary {
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  total: number;
}

const STEPS = [
  { id: 1, name: 'Select Client', description: 'Choose who this proposal is for' },
  { id: 2, name: 'Build Services', description: 'Add and customize services' },
  { id: 3, name: 'Review & Send', description: 'Final adjustments and send' },
];

const SERVICE_CATEGORIES = [
  { id: 'COMPLIANCE', name: 'Compliance', icon: '📋', color: 'bg-blue-100 text-blue-700' },
  { id: 'ADVISORY', name: 'Advisory', icon: '💡', color: 'bg-amber-100 text-amber-700' },
  { id: 'TAX', name: 'Tax', icon: '💰', color: 'bg-green-100 text-green-700' },
  { id: 'BOOKKEEPING', name: 'Bookkeeping', icon: '📚', color: 'bg-purple-100 text-purple-700' },
  { id: 'PAYROLL', name: 'Payroll', icon: '👥', color: 'bg-pink-100 text-pink-700' },
  { id: 'OTHER', name: 'Other', icon: '✨', color: 'bg-slate-100 text-slate-700' },
];

const COVER_TEMPLATES = [
  { id: 'professional', name: 'Professional', description: 'Clean and corporate' },
  { id: 'friendly', name: 'Friendly', description: 'Warm and approachable' },
  { id: 'modern', name: 'Modern', description: 'Bold and contemporary' },
];

const CreateProposal = () => {
  const navigate = useNavigate();
  const { tenant } = useAuthStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Step 1: Client Selection
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showCreateClient, setShowCreateClient] = useState(false);
  
  // Step 2: Service Building
  const [services, setServices] = useState<Service[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
  const [editingService, setEditingService] = useState<string | null>(null);
  
  // Step 3: Summary & Send
  const [proposalTitle, setProposalTitle] = useState('');
  const [vatRate, setVatRate] = useState(20);
  const [includeVat, setIncludeVat] = useState(true);
  const [coverTemplate, setCoverTemplate] = useState('professional');
  const [validUntil, setValidUntil] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  });
  const [sending, setSending] = useState(false);
  
  // Load initial data
  useEffect(() => {
    loadClients();
    loadServices();
  }, []);
  
  const loadClients = async () => {
    try {
      const response = await apiClient.getClients({ limit: 50 }) as any;
      if (response.success) {
        setClients(response.data || []);
      }
    } catch (error) {
      toast.error('Failed to load clients');
    }
  };
  
  const loadServices = async () => {
    try {
      const response = await apiClient.getServices() as any;
      if (response.success) {
        setServices(response.data || []);
      }
    } catch (error) {
      toast.error('Failed to load services');
    }
  };
  
  // Filtered clients
  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients.slice(0, 5); // Show recent 5
    return clients.filter(c => 
      c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      c.contactEmail.toLowerCase().includes(clientSearch.toLowerCase())
    );
  }, [clients, clientSearch]);
  
  // Filtered services
  const filteredServices = useMemo(() => {
    let filtered = services;
    if (selectedCategory !== 'ALL') {
      filtered = filtered.filter(s => s.category === selectedCategory);
    }
    if (serviceSearch) {
      filtered = filtered.filter(s => 
        s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
        s.description?.toLowerCase().includes(serviceSearch.toLowerCase())
      );
    }
    return filtered;
  }, [services, selectedCategory, serviceSearch]);
  
  // Calculate totals - using line-level VAT
  const summary: ProposalSummary = useMemo(() => {
    const subtotal = selectedServices.reduce((sum, s) => sum + s.total, 0);
    const discountAmount = selectedServices.reduce((sum, s) => {
      const discount = s.quantity * s.unitPrice * (s.discountPercent / 100);
      return sum + discount;
    }, 0);
    const vatAmount = includeVat 
      ? selectedServices.reduce((sum, s) => sum + s.vatAmount, 0)
      : 0;
    const total = subtotal + vatAmount;
    
    return { subtotal, discountAmount, vatAmount, total };
  }, [selectedServices, includeVat]);
  
  // Add service
  const addService = (service: Service) => {
    const existing = selectedServices.find(s => s.id === service.id);
    if (existing) {
      toast.success('Service already added');
      return;
    }
    
    const newService: SelectedService = {
      ...service,
      quantity: 1,
      unitPrice: service.basePrice,
      discountPercent: 0,
      vatRate: 20, // Default VAT rate
      total: service.basePrice, // Net total
      vatAmount: service.basePrice * 0.2, // VAT amount
      grossTotal: service.basePrice * 1.2, // Gross total
      serviceTemplateId: service.id, // Store original service ID
    };
    setSelectedServices([...selectedServices, newService]);
    toast.success(`${service.name} added`);
  };
  
  // Update service
  const updateService = (id: string, updates: Partial<SelectedService>) => {
    setSelectedServices(prev => prev.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, ...updates };
      // Recalculate totals
      const baseTotal = updated.quantity * updated.unitPrice;
      const discount = baseTotal * (updated.discountPercent / 100);
      const netTotal = baseTotal - discount;
      const vatAmount = netTotal * (updated.vatRate / 100);
      updated.total = netTotal;
      updated.vatAmount = vatAmount;
      updated.grossTotal = netTotal + vatAmount;
      return updated;
    }));
  };
  
  // Remove service
  const removeService = (id: string) => {
    setSelectedServices(prev => prev.filter(s => s.id !== id));
  };
  
  // Duplicate service
  const duplicateService = (service: SelectedService) => {
    const newService: SelectedService = {
      ...service,
      id: `${service.id}-${Date.now()}`,
      name: `${service.name} (Copy)`,
      // Keep serviceTemplateId the same as original
    };
    setSelectedServices([...selectedServices, newService]);
  };
  
  // Create proposal
  const createProposal = async (sendOptions: { method: 'email' | 'link'; email?: string }) => {
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
    
    setSending(true);
    try {
      // Format services for the backend API
      const servicesData = selectedServices.map(s => {
        console.log('Service:', s.name, 'serviceTemplateId:', s.serviceTemplateId, 'id:', s.id);
        return {
          serviceId: s.serviceTemplateId, // Use original service template ID
          quantity: s.quantity,
          discountPercent: s.discountPercent,
        };
      });
      
      console.log('Creating proposal with services:', servicesData);
      
      const proposalData = {
        clientId: selectedClient.id,
        title: proposalTitle,
        services: servicesData,
        validUntil: new Date(validUntil).toISOString(),
        coverLetter: generateCoverLetter(selectedClient.name, coverTemplate),
      };
      
      const response = await apiClient.createProposal(proposalData) as any;
      
      if (response.success) {
        const proposalId = response.data.id;
        
        if (sendOptions.method === 'email' && sendOptions.email) {
          await apiClient.post(`/proposals/${proposalId}/send`, {
            email: sendOptions.email,
          });
          toast.success('Proposal created and sent!');
        } else {
          // Copy link to clipboard
          const shareUrl = `${window.location.origin}/proposals/view/${response.data.shareToken}`;
          await navigator.clipboard.writeText(shareUrl);
          toast.success('Proposal created! Link copied to clipboard');
        }
        
        navigate('/proposals');
      }
    } catch (error) {
      toast.error('Failed to create proposal');
    } finally {
      setSending(false);
    }
  };
  
  // Generate cover letter based on template
  const generateCoverLetter = (clientName: string, template: string) => {
    const currentYear = new Date().getFullYear();
    
    const templates: Record<string, string> = {
      professional: `Dear ${clientName},

Thank you for taking the time to review this proposal for your accounting and taxation services for the ${currentYear}/${(currentYear + 1).toString().slice(-2)} financial year.

You already know that having the right accounting partner makes all the difference to a growing business. Many successful business owners discover that professional accountancy support isn't just about compliance—it's about creating the financial clarity that drives better decisions.

As you read through the services outlined in this proposal, you'll notice how each element has been carefully tailored to support your specific circumstances. We've taken into account your business structure, industry requirements, and growth trajectory to ensure you receive exactly the support you need.

By choosing to proceed with this engagement, you can expect:

• Peace of mind knowing your statutory obligations are handled accurately and on time
• Clear visibility of your financial position through regular management information  
• Proactive advice that helps you minimise tax liabilities within the legal framework
• Dedicated support from a team that understands your business and its objectives

You'll find that our approach combines the latest cloud accounting technology with the personal service that only comes from a relationship-focused practice. This means you benefit from real-time financial data whilst having direct access to experienced professionals who can interpret what those numbers mean for your business.

When business owners work with us, they often remark on how much more confident they feel about their financial decisions. As your accountants, we become an integral part of your team—helping you navigate not just the numbers, but the strategic implications behind them.

I invite you to review the detailed service breakdown and terms enclosed. Should you have any questions or wish to discuss any aspect of this proposal, please don't hesitate to contact me directly.

Once you're ready to proceed, simply accept this proposal electronically or return a signed copy. We'll then arrange your onboarding and can typically have your systems set up within 48 hours.

The sooner we begin, the sooner you'll have the financial clarity and compliance confidence that lets you focus on what you do best—growing your business.

Thank you for considering us as your accounting partners. We look forward to supporting your success.

Warm regards,

The Team at ${tenant?.name || 'Capstone'}`,

      friendly: `Hi ${clientName},

We're thrilled you've asked us to put together a proposal for your accounting services for the ${currentYear}/${(currentYear + 1).toString().slice(-2)} year!

We know that choosing an accountant is a big decision. You're not just looking for someone to crunch numbers—you want a partner who genuinely cares about your success and makes your life easier, not harder.

That's exactly what we do. We take the time to understand your business inside and out, so we can provide advice that's not just technically correct, but actually useful for your specific situation.

Here's what you can expect when you work with us:

🎯 **Peace of Mind**: We'll handle all the compliance stuff—deadlines, filings, regulations—so you can sleep soundly knowing nothing's been missed.

📊 **Clear Insights**: No more wondering how your business is actually doing. We'll give you regular, easy-to-understand updates on your financial position.

💡 **Smart Tax Planning**: We'll make sure you're not paying a penny more in tax than you need to, completely legally.

🤝 **Genuine Support**: Questions? Concerns? Just want to bounce an idea around? We're always here for you.

We've designed the services in this proposal specifically for you. Take a look through, and if anything needs tweaking—whether that's adding something, removing something, or adjusting the price—just let us know. No hard feelings, no pressure.

Ready to get started? Simply accept the proposal online, and we'll have you up and running within 48 hours.

Thanks again for considering us. We can't wait to help your business thrive!

Warm regards,

The Team at ${tenant?.name || 'Capstone'}

P.S. This proposal is valid for 30 days, but the sooner we start, the sooner you'll benefit from having a proper handle on your finances!`,

      modern: `${clientName},

Your business deserves more than basic compliance. You need strategic financial partnership that drives real results.

This proposal outlines how ${tenant?.name || 'Capstone'} will deliver exactly that for the ${currentYear}/${(currentYear + 1).toString().slice(-2)} financial year.

**THE CHALLENGE**
Running a business means wearing many hats. But finance doesn't have to be one of them. Every hour you spend wrestling with receipts, reconciling accounts, or worrying about tax deadlines is an hour you're not spending growing your business.

**OUR SOLUTION**
We combine cutting-edge cloud accounting technology with expert human oversight to deliver:

→ **Automated Efficiency**: Smart systems handle the routine work
→ **Expert Oversight**: Qualified accountants ensure everything's correct  
→ **Strategic Insight**: Regular reviews to optimise your financial position
→ **Zero Surprises**: Proactive communication, never reactive scrambling

**THE ENGAGEMENT**
The services detailed in this proposal are tailored to your business structure and growth stage. Each element has been carefully selected to provide maximum value without unnecessary overhead.

**NEXT STEPS**
1. Review the service specifications and pricing
2. Ask us anything—no question too small
3. Accept electronically when ready
4. We onboard you within 48 hours

**QUESTIONS?**
Email or call us anytime. We're here to make this easy.

Let's build your financial foundation.

— ${tenant?.name || 'Capstone'}`,
    };
    
    return templates[template] || templates.professional;
  };
  
  // Navigation
  const canProceed = () => {
    switch (currentStep) {
      case 1: return selectedClient !== null;
      case 2: return selectedServices.length > 0;
      case 3: return proposalTitle.length > 0;
      default: return false;
    }
  };
  
  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link to="/proposals" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 mb-4">
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to proposals
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Create Proposal</h1>
        <p className="text-slate-500 dark:text-slate-400">Build a professional proposal in 3 simple steps</p>
      </div>
      
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors
                  ${currentStep > step.id 
                    ? 'bg-green-500 text-white' 
                    : currentStep === step.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                  }`}>
                  {currentStep > step.id ? <CheckIcon className="w-5 h-5" /> : step.id}
                </div>
                <span className={`mt-2 text-xs font-medium ${currentStep === step.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {step.name}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-4 transition-colors ${currentStep > step.id ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Step Content */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-soft border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* STEP 1: Select Client */}
        {currentStep === 1 && (
          <div className="p-8">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Who is this proposal for?
            </h2>
            
            {/* Search & Create */}
            <div className="flex gap-4 mb-6">
              <div className="flex-1 relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={() => setShowCreateClient(true)}
                className="px-4 py-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-2"
              >
                <PlusIcon className="w-5 h-5" />
                New Client
              </button>
            </div>
            
            {/* Client List */}
            <div className="space-y-3">
              {filteredClients.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  <BuildingOfficeIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No clients found. Create your first client to continue.</p>
                </div>
              ) : (
                filteredClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4
                      ${selectedClient?.id === client.id
                        ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/20'
                        : 'border-slate-200 dark:border-slate-200 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-white dark:hover:bg-slate-700/50'
                      }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-semibold">
                      {client.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{client.name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{client.contactEmail}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full">
                      {client.companyType.replace(/_/g, ' ')}
                    </span>
                    {selectedClient?.id === client.id && (
                      <CheckIcon className="w-6 h-6 text-blue-500" />
                    )}
                  </button>
                ))
              )}
            </div>
            
            {/* Selected Client Preview */}
            {selectedClient && (
              <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <CheckIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="text-green-800 dark:text-green-200">
                    Selected: <strong>{selectedClient.name}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* STEP 2: Build Services */}
        {currentStep === 2 && (
          <div className="flex h-[600px]">
            {/* Left: Service Catalog */}
            <div className="w-1/2 border-r border-slate-200 dark:border-slate-200 flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-200">
                <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Service Catalog</h3>
                <input
                  type="text"
                  placeholder="Search services..."
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              
              {/* Category Tabs */}
              <div className="flex gap-2 p-4 overflow-x-auto border-b border-slate-200 dark:border-slate-200">
                <button
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors
                    ${selectedCategory === 'ALL'
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                  All Services
                </button>
                {SERVICE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1
                      ${selectedCategory === cat.id
                        ? `${cat.color} ring-2 ring-offset-1 ring-current`
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                  >
                    <span>{cat.icon}</span>
                    {cat.name}
                  </button>
                ))}
              </div>
              
              {/* Services List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filteredServices.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => addService(service)}
                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-200 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-all text-left group"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {service.name}
                        </h4>
                        {service.description && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">{service.description}</p>
                        )}
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        £{service.basePrice.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                        {service.category}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {service.billingCycle}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Right: Selected Services */}
            <div className="w-1/2 flex flex-col bg-slate-50 dark:bg-slate-900">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Selected Services ({selectedServices.length})
                </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedServices.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                    <p>Click services on the left to add them</p>
                  </div>
                ) : (
                  selectedServices.map((service, index) => (
                    <div
                      key={service.id}
                      className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-medium text-slate-900 dark:text-white">{service.name}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{service.category}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingService(editingService === service.id ? null : service.id)}
                            className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => duplicateService(service)}
                            className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            <DocumentDuplicateIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeService(service.id)}
                            className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {/* Inline Edit Controls */}
                      <div className="grid grid-cols-4 gap-2 text-sm">
                        <div>
                          <label className="text-xs text-slate-500 dark:text-slate-400">Qty</label>
                          <input
                            type="number"
                            min="1"
                            value={service.quantity}
                            onChange={(e) => updateService(service.id, { quantity: parseInt(e.target.value) || 1 })}
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-slate-400">Unit £</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={service.unitPrice}
                            onChange={(e) => updateService(service.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-slate-400">Discount %</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={service.discountPercent}
                            onChange={(e) => updateService(service.id, { discountPercent: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-slate-400">VAT %</label>
                          <select
                            value={service.vatRate}
                            onChange={(e) => updateService(service.id, { vatRate: parseFloat(e.target.value) || 0 })}
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm"
                          >
                            <option value={0}>0%</option>
                            <option value={5}>5%</option>
                            <option value={20}>20%</option>
                          </select>
                        </div>
                      </div>
                      
                      {/* Line Totals */}
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-200">
                        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                          <span>Net: £{service.total.toFixed(2)}</span>
                          <span>VAT ({service.vatRate}%): £{service.vatAmount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {service.quantity} × £{service.unitPrice}
                            {service.discountPercent > 0 && ` (-${service.discountPercent}%)`}
                          </span>
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            £{service.grossTotal.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Running Total */}
              {selectedServices.length > 0 && (
                <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600 dark:text-slate-300">Subtotal</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      £{summary.subtotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* STEP 3: Review & Send */}
        {currentStep === 3 && (
          <div className="p-8">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6">
              Review and Send
            </h2>
            
            <div className="grid grid-cols-3 gap-8">
              {/* Left: Proposal Details */}
              <div className="col-span-2 space-y-6">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Proposal Title
                  </label>
                  <input
                    type="text"
                    value={proposalTitle}
                    onChange={(e) => setProposalTitle(e.target.value)}
                    placeholder="e.g., Annual Accounting Services 2026"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-lg"
                  />
                </div>
                
                {/* Cover Template */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Cover Letter Style
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {COVER_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setCoverTemplate(template.id)}
                        className={`p-4 rounded-xl border-2 text-left transition-all
                          ${coverTemplate === template.id
                            ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                      >
                        <h4 className="font-medium text-slate-900 dark:text-white">{template.name}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{template.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Valid Until */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Valid Until
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
                
                {/* Services Summary */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Services Summary</h3>
                  <div className="space-y-3">
                    {selectedServices.map((service) => (
                      <div key={service.id} className="flex justify-between text-sm">
                        <span className="text-slate-700 dark:text-slate-300">
                          {service.name} ({service.quantity} × £{service.unitPrice})
                          {service.discountPercent > 0 && (
                            <span className="text-green-600 dark:text-green-400 ml-1">
                              -{service.discountPercent}%
                            </span>
                          )}
                        </span>
                        <span className="font-medium text-slate-900 dark:text-white">
                          £{service.total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Right: Pricing & Totals */}
              <div className="space-y-6">
                {/* VAT Settings */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-medium text-slate-900 dark:text-white">Include VAT</span>
                    <button
                      onClick={() => setIncludeVat(!includeVat)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${includeVat ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                        ${includeVat ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  
                  {includeVat && (
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">VAT Rate</label>
                      <select
                        value={vatRate}
                        onChange={(e) => setVatRate(parseInt(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      >
                        <option value={0}>0%</option>
                        <option value={5}>5%</option>
                        <option value={20}>20%</option>
                      </select>
                    </div>
                  )}
                </div>
                
                {/* Totals */}
                <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <CalculatorIcon className="w-5 h-5" />
                    Totals
                  </h3>
                  
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Subtotal</span>
                      <span>£{summary.subtotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                    </div>
                    
                    {summary.discountAmount > 0 && (
                      <div className="flex justify-between text-green-600 dark:text-green-400">
                        <span>Discount</span>
                        <span>-£{summary.discountAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    
                    {includeVat && (
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>VAT ({vatRate}%)</span>
                        <span>£{summary.vatAmount.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-200">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-900 dark:text-white">Total</span>
                        <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          £{summary.total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Send Actions */}
                <div className="space-y-3">
                  <button
                    onClick={() => createProposal({ method: 'link' })}
                    disabled={sending || !canProceed()}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {sending ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <DocumentDuplicateIcon className="w-5 h-5" />
                        Create & Copy Link
                      </>
                    )}
                  </button>
                  
                  {selectedClient?.contactEmail && (
                    <button
                      onClick={() => createProposal({ method: 'email', email: selectedClient.contactEmail })}
                      disabled={sending || !canProceed()}
                      className="w-full py-3 px-4 bg-white dark:bg-white border-2 border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowRightIcon className="w-5 h-5" />
                      Send via Email
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Navigation Buttons */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
          disabled={currentStep === 1}
          className="px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-200 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Back
        </button>
        
        {currentStep < 3 && (
          <button
            onClick={() => setCurrentStep(currentStep + 1)}
            disabled={!canProceed()}
            className="px-6 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            Continue
            <ArrowRightIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default CreateProposal;
