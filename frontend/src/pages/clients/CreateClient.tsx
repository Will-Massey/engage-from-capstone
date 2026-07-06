import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeftIcon,
  BuildingOfficeIcon,
  UserIcon,
  UsersIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

const clientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  companyType: z.enum([
    'LIMITED_COMPANY',
    'SOLE_TRADER',
    'PARTNERSHIP',
    'LLP',
    'CHARITY',
    'NON_PROFIT',
  ]),
  contactEmail: z.string().min(1, 'Email is required').email('Please enter a valid email'),
  contactPhone: z.string().optional(),
  contactName: z.string().min(1, 'Main contact name is required'),
  companyNumber: z.string().optional(),
  utr: z.string().optional(),
  vatRegistered: z.boolean().default(false),
  industry: z.string().optional(),
  // Handle empty number inputs (NaN from valueAsNumber)
  employeeCount: z.preprocess(
    (val) =>
      val === '' || val === null || val === undefined || Number.isNaN(val)
        ? undefined
        : Number(val),
    z.number().min(0).optional()
  ),
  turnover: z.preprocess(
    (val) =>
      val === '' || val === null || val === undefined || Number.isNaN(val)
        ? undefined
        : Number(val),
    z.number().min(0).optional()
  ),
  mtditsaIncome: z.preprocess(
    (val) =>
      val === '' || val === null || val === undefined || Number.isNaN(val)
        ? undefined
        : Number(val),
    z.number().min(0).optional()
  ),
  notes: z.string().optional(),
  clientRelationship: z.enum(['NEW', 'EXISTING']).default('NEW'),
  // Address - all optional
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
});

type ClientForm = z.infer<typeof clientSchema>;

const companyTypes = [
  { id: 'LIMITED_COMPANY', label: 'Limited Company', icon: BuildingOfficeIcon },
  { id: 'SOLE_TRADER', label: 'Sole Trader', icon: UserIcon },
  { id: 'PARTNERSHIP', label: 'Partnership', icon: UsersIcon },
  { id: 'LLP', label: 'Limited Liability Partnership', icon: BuildingOfficeIcon },
  { id: 'CHARITY', label: 'Charity', icon: HomeIcon },
  { id: 'NON_PROFIT', label: 'Non-Profit Organisation', icon: HomeIcon },
];

interface CreateClientProps {
  onSuccess?: (client: any) => void;
  onCancel?: () => void;
}

const CreateClient = ({ onSuccess, onCancel }: CreateClientProps = {}) => {
  const navigate = useNavigate();
  const { tenant } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      companyType: 'LIMITED_COMPANY',
      vatRegistered: false,
      contactName: '',
      clientRelationship: 'NEW',
    },
    mode: 'onChange',
  });

  // Form validation debug removed

  const watchCompanyType = watch('companyType');
  const watchMtditsaIncome = watch('mtditsaIncome');
  const watchClientRelationship = watch('clientRelationship');

  // Companies House search state
  const [chSearchQuery, setChSearchQuery] = useState('');
  const [chSearchResults, setChSearchResults] = useState<
    Array<{
      companyNumber: string;
      companyName: string;
      companyStatus: string;
      companyType: string;
    }>
  >([]);
  const [chSearching, setChSearching] = useState(false);
  const [chShowResults, setChShowResults] = useState(false);
  const [chSelectedCompany, setChSelectedCompany] = useState<string | null>(null);
  const [chConfigured, setChConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = (await apiClient.get('/companies-house/status')) as any;
        if (response.success) {
          setChConfigured(!!response.data?.configured && !!response.data?.connected);
        }
      } catch {
        setChConfigured(false);
      }
    };
    if (watchCompanyType === 'LIMITED_COMPANY' || watchCompanyType === 'LLP') {
      checkStatus();
    }
  }, [watchCompanyType]);

  const chErrorMessage = (error: unknown): string => {
    const err = error as {
      response?: { data?: { error?: { message?: string; code?: string } } };
      message?: string;
    };
    const code = err.response?.data?.error?.code;
    const message = err.response?.data?.error?.message;
    if (code === 'NOT_CONFIGURED') {
      return 'Companies House API key is not set on the server. Add COMPANIES_HOUSE_API_KEY to backend/.env.';
    }
    if (message) return message;
    return 'Failed to search Companies House';
  };

  // Search Companies House
  const searchCompaniesHouse = async () => {
    if (!chSearchQuery.trim() || chSearchQuery.length < 2) return;

    setChSearching(true);
    try {
      const response = (await apiClient.get(
        `/companies-house/search?q=${encodeURIComponent(chSearchQuery)}&limit=5`
      )) as any;
      if (response.success) {
        setChSearchResults(response.data || []);
        setChShowResults(true);
        if (!response.data?.length) {
          toast('No companies found — try a different name or number');
        }
      }
    } catch (error) {
      toast.error(chErrorMessage(error));
    } finally {
      setChSearching(false);
    }
  };

  // Get company details and auto-populate form
  const selectCompany = async (companyNumber: string) => {
    setChSelectedCompany(companyNumber);
    try {
      const response = (await apiClient.get(`/companies-house/company/${companyNumber}`)) as any;
      if (response.success) {
        const company = response.data.formatted; // Use formatted data from backend

        // Auto-populate form fields
        setValue('name', company.name);
        setValue('companyNumber', company.companyNumber);
        if (company.address) {
          setValue('addressLine1', company.address.line1 || '');
          setValue('addressLine2', company.address.line2 || '');
          setValue('city', company.address.city || '');
          setValue('postcode', company.address.postcode || '');
        }

        toast.success('Company details loaded');
        setChShowResults(false);
      }
    } catch (error) {
      toast.error(chErrorMessage(error) || 'Failed to load company details');
    }
  };

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setChShowResults(false);
    if (chShowResults) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [chShowResults]);

  const onSubmit = async (data: ClientForm) => {
    setIsLoading(true);
    toast.loading('Creating client...');
    try {
      // Build address only if any field is provided
      const address =
        data.addressLine1 || data.city || data.postcode
          ? {
              line1: data.addressLine1 || '',
              line2: data.addressLine2 || '',
              city: data.city || '',
              postcode: data.postcode || '',
              country: 'United Kingdom',
            }
          : undefined;

      const response = (await apiClient.createClient({
        name: data.name,
        companyType: data.companyType,
        contactEmail: data.contactEmail || undefined,
        contactPhone: data.contactPhone,
        contactName: data.contactName,
        companyNumber: data.companyNumber || undefined,
        utr: data.utr || undefined,
        vatRegistered: data.vatRegistered,
        industry: data.industry,
        employeeCount: data.employeeCount,
        turnover: data.turnover,
        mtditsaIncome: data.mtditsaIncome,
        notes: data.notes,
        clientRelationship: data.clientRelationship,
        address,
      })) as any;

      toast.dismiss();
      if (response.success) {
        toast.success('Client created successfully');
        if (onSuccess) {
          onSuccess(response.data);
        } else {
          navigate(`/clients/${response.data.id}`);
        }
      }
    } catch (error: any) {
      toast.dismiss();
      // Error handled by toast notification
      toast.error(error.message || 'Failed to create client');
    } finally {
      setIsLoading(false);
    }
  };

  // MTD ITSA only applies to Sole Traders and Partnerships
  const mtditsaApplicableTypes = ['SOLE_TRADER', 'PARTNERSHIP'];
  const isMtditsaApplicable = mtditsaApplicableTypes.includes(watchCompanyType);
  const needsMtditsaWarning =
    isMtditsaApplicable && Number.isFinite(watchMtditsaIncome) && watchMtditsaIncome >= 30000;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        {onCancel ? (
          <button
            onClick={onCancel}
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Cancel
          </button>
        ) : (
          <Link
            to="/clients"
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back to clients
          </Link>
        )}
        <h1 className="text-2xl font-bold text-slate-900 mt-4">Add New Client</h1>
        <p className="text-sm text-slate-500">Enter your client's details to get started</p>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center">
          <div
            className={`flex-1 h-2 rounded-full ${step >= 1 ? 'bg-blue-500' : 'bg-slate-200'}`}
          />
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            1
          </div>
          <div
            className={`flex-1 h-2 rounded-full ${step >= 2 ? 'bg-blue-500' : 'bg-slate-200'}`}
          />
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            2
          </div>
          <div
            className={`flex-1 h-2 rounded-full ${step >= 3 ? 'bg-blue-500' : 'bg-slate-200'}`}
          />
        </div>
        <div className="flex justify-between mt-2 text-sm text-slate-500">
          <span>Basic Info</span>
          <span>Details</span>
          <span>Review</span>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit, (errors) => {
          // Validation errors displayed in form
          toast.error('Please fill in all required fields');
        })}
        className="card p-6"
      >
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            {/* New vs existing — feeds Clara renewal vs onboarding tone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Client relationship with your practice
              </label>
              <p className="text-xs text-slate-500 mb-3">
                Clara uses this to tailor proposals — onboarding language for new clients, renewal
                framing for existing ones.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex flex-col p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    watchClientRelationship === 'NEW'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    value="NEW"
                    {...register('clientRelationship')}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold text-slate-900">New client</span>
                  <span className="text-xs text-slate-500 mt-1">
                    First engagement — winning them onto your books
                  </span>
                </label>
                <label
                  className={`flex flex-col p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                    watchClientRelationship === 'EXISTING'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    value="EXISTING"
                    {...register('clientRelationship')}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold text-slate-900">Existing client</span>
                  <span className="text-xs text-slate-500 mt-1">
                    Already on your books — renewal, uplift, or extra services
                  </span>
                </label>
              </div>
            </div>

            {/* Company Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Company Type</label>
              <div className="grid grid-cols-2 gap-3">
                {companyTypes.map((type) => (
                  <label
                    key={type.id}
                    className={`relative flex flex-col items-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      watchCompanyType === type.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      value={type.id}
                      {...register('companyType')}
                      className="sr-only"
                    />
                    <type.icon className="h-8 w-8 text-slate-400 mb-2" />
                    <span className="text-sm font-medium text-slate-900">{type.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Companies House Search - Only for LIMITED_COMPANY and LLP */}
            {(watchCompanyType === 'LIMITED_COMPANY' || watchCompanyType === 'LLP') && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <label className="block text-sm font-medium text-blue-900 mb-2">
                  <MagnifyingGlassIcon className="h-4 w-4 inline mr-1" />
                  Search Companies House
                </label>
                <p className="text-xs text-blue-700 mb-3">
                  Search for a company to auto-fill details
                </p>
                {chConfigured === false && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
                    Companies House lookup is not available — the server API key is missing or
                    invalid. Set <code className="font-mono">COMPANIES_HOUSE_API_KEY</code> in{' '}
                    <code className="font-mono">backend/.env</code> (free key from{' '}
                    <a
                      href="https://developer.company-information.service.gov.uk/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Companies House Developer Hub
                    </a>
                    ).
                  </p>
                )}
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chSearchQuery}
                      onChange={(e) => setChSearchQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && (e.preventDefault(), searchCompaniesHouse())
                      }
                      className="flex-1 input-field text-sm"
                      placeholder="Enter company name..."
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        searchCompaniesHouse();
                      }}
                      disabled={chSearching || chSearchQuery.length < 2}
                      className="btn-secondary text-sm px-4 disabled:opacity-50"
                    >
                      {chSearching ? 'Searching...' : 'Search'}
                    </button>
                  </div>

                  {/* Search Results Dropdown */}
                  {chShowResults && chSearchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
                      {chSearchResults.map((result) => (
                        <button
                          key={result.companyNumber}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectCompany(result.companyNumber);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-slate-900">{result.companyName}</p>
                              <p className="text-sm text-slate-500">
                                {result.companyNumber} • {result.companyStatus}
                              </p>
                            </div>
                            {chSelectedCompany === result.companyNumber && (
                              <CheckIcon className="h-5 w-5 text-green-500" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {chShowResults && chSearchResults.length === 0 && !chSearching && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg p-4 text-center text-slate-500">
                      No companies found
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Client Name</label>
              <input
                {...register('name')}
                className="mt-1 input-field"
                placeholder="e.g., ABC Ltd or John Smith"
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700">Email Address</label>
              <input
                {...register('contactEmail')}
                type="email"
                className="mt-1 input-field"
                placeholder="client@example.com"
              />
              {errors.contactEmail && (
                <p className="mt-1 text-sm text-red-600">{errors.contactEmail.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Main contact name</label>
              <input
                {...register('contactName')}
                name="contactName"
                type="text"
                className="mt-1 input-field"
                placeholder="e.g. Jane Smith"
                autoComplete="name"
              />
              {errors.contactName && (
                <p className="mt-1 text-sm text-red-600">{errors.contactName.message}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Used in proposals and correspondence. Can differ from the legal client name above.
              </p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Phone Number (optional)
              </label>
              <input
                {...register('contactPhone')}
                type="tel"
                className="mt-1 input-field"
                placeholder="+44 20 7946 0958"
              />
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={() => setStep(2)} className="btn-primary">
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            {/* Company Number */}
            {(watchCompanyType === 'LIMITED_COMPANY' || watchCompanyType === 'LLP') && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Company Number</label>
                <input
                  {...register('companyNumber')}
                  className="mt-1 input-field"
                  placeholder="12345678"
                />
              </div>
            )}

            {/* UTR */}
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Unique Taxpayer Reference (UTR)
              </label>
              <input
                {...register('utr')}
                className="mt-1 input-field"
                placeholder="1234567890"
                maxLength={10}
              />
              {errors.utr && <p className="mt-1 text-sm text-red-600">{errors.utr.message}</p>}
            </div>

            {/* Turnover */}
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Estimated Annual Turnover/Income
              </label>
              <div className="mt-1 relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  £
                </span>
                <input
                  {...register('mtditsaIncome')}
                  type="text"
                  inputMode="numeric"
                  className="input-field pl-7"
                  placeholder="50000"
                />
              </div>
              {needsMtditsaWarning && (
                <p className="mt-2 text-sm text-orange-600 bg-orange-50 p-2 rounded">
                  ⚠️ This sole trader may need to comply with MTD ITSA from April 2026
                </p>
              )}
              {!isMtditsaApplicable &&
                Number.isFinite(watchMtditsaIncome) &&
                watchMtditsaIncome > 0 && (
                  <p className="mt-2 text-sm text-blue-600 bg-blue-50 p-2 rounded">
                    ℹ️ MTD ITSA does not apply to{' '}
                    {companyTypes.find((t) => t.id === watchCompanyType)?.label ||
                      'this entity type'}
                    . It only applies to Sole Traders and Partnerships.
                  </p>
                )}
            </div>

            {/* Employee Count */}
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Number of Employees
              </label>
              <input
                {...register('employeeCount')}
                type="text"
                inputMode="numeric"
                className="mt-1 input-field"
                placeholder="0"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Address</label>
              <div className="space-y-3">
                <input
                  {...register('addressLine1')}
                  className="input-field"
                  placeholder="Address line 1"
                />
                <input
                  {...register('addressLine2')}
                  className="input-field"
                  placeholder="Address line 2 (optional)"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input {...register('city')} className="input-field" placeholder="City" />
                  <input
                    {...register('postcode')}
                    className={errors.postcode ? 'input-field-error' : 'input-field'}
                    placeholder="Postcode"
                  />
                </div>
                {errors.postcode && (
                  <p className="text-sm text-red-600">{errors.postcode.message}</p>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">
                Back
              </button>
              <button type="submit" disabled={isLoading} className="btn-primary" onClick={() => {}}>
                {isLoading ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default CreateClient;
