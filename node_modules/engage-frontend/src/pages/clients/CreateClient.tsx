import { useState } from 'react';
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
} from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

const clientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  companyType: z.enum(['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP', 'LLP', 'CHARITY']),
  contactEmail: z.string().email('Please enter a valid email'),
  contactPhone: z.string().optional(),
  contactName: z.string().optional(),
  companyNumber: z.string().optional(),
  utr: z.string().regex(/^\d{10}$/, 'UTR must be 10 digits').optional().or(z.literal('')),
  vatRegistered: z.boolean().default(false),
  industry: z.string().optional(),
  employeeCount: z.number().min(0).optional(),
  turnover: z.number().min(0).optional(),
  mtditsaIncome: z.number().min(0).optional(),
  notes: z.string().optional(),
  // Address
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().regex(/^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i, 'Invalid UK postcode').optional().or(z.literal('')),
});

type ClientForm = z.infer<typeof clientSchema>;

const companyTypes = [
  { id: 'LIMITED_COMPANY', label: 'Limited Company', icon: BuildingOfficeIcon },
  { id: 'SOLE_TRADER', label: 'Sole Trader', icon: UserIcon },
  { id: 'PARTNERSHIP', label: 'Partnership', icon: UsersIcon },
  { id: 'LLP', label: 'Limited Liability Partnership', icon: BuildingOfficeIcon },
  { id: 'CHARITY', label: 'Charity', icon: HomeIcon },
];

const CreateClient = () => {
  const navigate = useNavigate();
  const { tenant } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      companyType: 'LIMITED_COMPANY',
      vatRegistered: false,
    },
  });

  const watchCompanyType = watch('companyType');
  const watchMtditsaIncome = watch('mtditsaIncome');

  const onSubmit = async (data: ClientForm) => {
    setIsLoading(true);
    try {
      const response = await apiClient.createClient({
        name: data.name,
        companyType: data.companyType,
        contactEmail: data.contactEmail,
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
        address: data.addressLine1 ? {
          line1: data.addressLine1,
          line2: data.addressLine2,
          city: data.city,
          postcode: data.postcode,
          country: 'United Kingdom',
        } : undefined,
      }) as any;

      if (response.success) {
        toast.success('Client created successfully');
        navigate(`/clients/${response.data.id}`);
      }
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsLoading(false);
    }
  };

  const needsMtditsaWarning = watchMtditsaIncome && watchMtditsaIncome >= 30000;

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/clients"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to clients
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-4">Add New Client</h1>
        <p className="text-sm text-gray-500">Enter your client's details to get started</p>
      </div>

      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center">
          <div className={`flex-1 h-2 rounded-full ${step >= 1 ? 'bg-primary-500' : 'bg-gray-200'}`} />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>1</div>
          <div className={`flex-1 h-2 rounded-full ${step >= 2 ? 'bg-primary-500' : 'bg-gray-200'}`} />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
            step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
          }`}>2</div>
          <div className={`flex-1 h-2 rounded-full ${step >= 3 ? 'bg-primary-500' : 'bg-gray-200'}`} />
        </div>
        <div className="flex justify-between mt-2 text-sm text-gray-500">
          <span>Basic Info</span>
          <span>Details</span>
          <span>Review</span>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-6">
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            {/* Company Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Company Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                {companyTypes.map((type) => (
                  <label
                    key={type.id}
                    className={`relative flex flex-col items-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      watchCompanyType === type.id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      value={type.id}
                      {...register('companyType')}
                      className="sr-only"
                    />
                    <type.icon className="h-8 w-8 text-gray-400 mb-2" />
                    <span className="text-sm font-medium text-gray-900">{type.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Client Name
              </label>
              <input
                {...register('name')}
                className="mt-1 input-field"
                placeholder="e.g., ABC Ltd or John Smith"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
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

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
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
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-primary"
              >
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
                <label className="block text-sm font-medium text-gray-700">
                  Company Number
                </label>
                <input
                  {...register('companyNumber')}
                  className="mt-1 input-field"
                  placeholder="12345678"
                />
              </div>
            )}

            {/* UTR */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Unique Taxpayer Reference (UTR)
              </label>
              <input
                {...register('utr')}
                className="mt-1 input-field"
                placeholder="1234567890"
                maxLength={10}
              />
              {errors.utr && (
                <p className="mt-1 text-sm text-red-600">{errors.utr.message}</p>
              )}
            </div>

            {/* Turnover */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Estimated Annual Turnover/Income
              </label>
              <div className="mt-1 relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">£</span>
                <input
                  {...register('mtditsaIncome', { valueAsNumber: true })}
                  type="number"
                  className="input-field pl-7"
                  placeholder="50000"
                />
              </div>
              {needsMtditsaWarning && (
                <p className="mt-2 text-sm text-orange-600 bg-orange-50 p-2 rounded">
                  ⚠️ This client may need to comply with MTD ITSA from April 2026
                </p>
              )}
            </div>

            {/* Employee Count */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Number of Employees
              </label>
              <input
                {...register('employeeCount', { valueAsNumber: true })}
                type="number"
                className="mt-1 input-field"
                placeholder="0"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address
              </label>
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
                  <input
                    {...register('city')}
                    className="input-field"
                    placeholder="City"
                  />
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
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-secondary"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary"
              >
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
