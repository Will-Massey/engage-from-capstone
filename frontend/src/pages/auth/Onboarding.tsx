import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckIcon } from '@heroicons/react/24/solid';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

const onboardingSchema = z.object({
  subdomain: z.string()
    .min(3, 'Subdomain must be at least 3 characters')
    .max(30, 'Subdomain must be at most 30 characters')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  name: z.string().min(1, 'Practice name is required'),
  adminEmail: z.string().email('Please enter a valid email'),
  adminFirstName: z.string().min(1, 'First name is required'),
  adminLastName: z.string().min(1, 'Last name is required'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

const steps = [
  { id: 1, name: 'Practice Details' },
  { id: 2, name: 'Admin Account' },
  { id: 3, name: 'Review' },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    trigger,
  } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onChange',
  });

  const watchSubdomain = watch('subdomain');

  const checkSubdomain = async () => {
    if (!watchSubdomain || watchSubdomain.length < 3) return;
    
    try {
      const response = await apiClient.checkSubdomain(watchSubdomain) as any;
      setSubdomainAvailable(response.data.available);
    } catch (error) {
      setSubdomainAvailable(false);
    }
  };

  const onSubmit = async (data: OnboardingForm) => {
    setIsLoading(true);
    try {
      const response = await apiClient.createTenant({
        subdomain: data.subdomain,
        name: data.name,
        adminEmail: data.adminEmail,
        adminFirstName: data.adminFirstName,
        adminLastName: data.adminLastName,
        adminPassword: data.adminPassword,
      }) as any;

      if (response.success) {
        setAuth(response.data.user, response.data.tenant, response.data.token);
        toast.success('Welcome to Engage!');
        navigate('/');
      }
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsLoading(false);
    }
  };

  const nextStep = async () => {
    let fieldsToValidate: (keyof OnboardingForm)[] = [];
    
    if (currentStep === 1) {
      fieldsToValidate = ['subdomain', 'name'];
    } else if (currentStep === 2) {
      fieldsToValidate = ['adminEmail', 'adminFirstName', 'adminLastName', 'adminPassword'];
    }

    const isValid = await trigger(fieldsToValidate);
    if (isValid) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Create your account</h2>
      <p className="text-slate-700 mb-6">Get started with your 14-day free trial</p>

      {/* Progress steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep > step.id
                    ? 'bg-primary-600 text-white'
                    : currentStep === step.id
                    ? 'bg-primary-100 text-primary-700 border-2 border-primary-600'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {currentStep > step.id ? (
                  <CheckIcon className="w-5 h-5" />
                ) : (
                  step.id
                )}
              </div>
              <span
                className={`ml-2 text-sm font-medium ${
                  currentStep >= step.id ? 'text-slate-900' : 'text-slate-600'
                }`}
              >
                {step.name}
              </span>
              {index < steps.length - 1 && (
                <div className="w-12 h-0.5 mx-4 bg-slate-200" />
              )}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Step 1: Practice Details */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <label className="block text-sm font-medium text-slate-800">
                Practice Name
              </label>
              <input
                {...register('name')}
                className="mt-1 input-field"
                placeholder="e.g., Smith & Associates"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800">
                Subdomain
              </label>
              <div className="mt-1 flex rounded-lg shadow-sm">
                <input
                  {...register('subdomain')}
                  onBlur={checkSubdomain}
                  className="flex-1 rounded-l-lg border-r-0 input-field"
                  placeholder="your-practice"
                />
                <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 text-slate-600 text-sm">
                  .engage.capstone.co.uk
                </span>
              </div>
              {errors.subdomain && (
                <p className="mt-1 text-sm text-red-600">{errors.subdomain.message}</p>
              )}
              {subdomainAvailable === true && (
                <p className="mt-1 text-sm text-green-600">✓ Subdomain available</p>
              )}
              {subdomainAvailable === false && (
                <p className="mt-1 text-sm text-red-600">✗ Subdomain already taken</p>
              )}
            </div>

            <button
              type="button"
              onClick={nextStep}
              className="w-full btn-primary py-2.5"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Admin Account */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-800">
                  First Name
                </label>
                <input
                  {...register('adminFirstName')}
                  className="mt-1 input-field"
                />
                {errors.adminFirstName && (
                  <p className="mt-1 text-sm text-red-600">{errors.adminFirstName.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-800">
                  Last Name
                </label>
                <input
                  {...register('adminLastName')}
                  className="mt-1 input-field"
                />
                {errors.adminLastName && (
                  <p className="mt-1 text-sm text-red-600">{errors.adminLastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800">
                Email Address
              </label>
              <input
                {...register('adminEmail')}
                type="email"
                className="mt-1 input-field"
              />
              {errors.adminEmail && (
                <p className="mt-1 text-sm text-red-600">{errors.adminEmail.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800">
                Password
              </label>
              <input
                {...register('adminPassword')}
                type="password"
                className="mt-1 input-field"
              />
              {errors.adminPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.adminPassword.message}</p>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 btn-secondary py-2.5"
              >
                Back
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex-1 btn-primary py-2.5"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div>
                <span className="text-sm text-slate-600">Practice:</span>
                <p className="font-medium">{watch('name')}</p>
              </div>
              <div>
                <span className="text-sm text-slate-600">Subdomain:</span>
                <p className="font-medium">{watch('subdomain')}.engage.capstone.co.uk</p>
              </div>
              <div>
                <span className="text-sm text-slate-600">Admin:</span>
                <p className="font-medium">
                  {watch('adminFirstName')} {watch('adminLastName')} ({watch('adminEmail')})
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <input
                type="checkbox"
                required
                className="mt-1 h-4 w-4 text-primary-600 border-slate-300 rounded"
              />
              <label className="ml-2 text-sm text-slate-700">
                I agree to the{' '}
                <a href="#" className="text-primary-600 hover:text-primary-500">Terms of Service</a>
                {' '}and{' '}
                <a href="#" className="text-primary-600 hover:text-primary-500">Privacy Policy</a>
              </label>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 btn-secondary py-2.5"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 btn-primary py-2.5"
              >
                {isLoading ? 'Creating Account...' : 'Create Account'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default Onboarding;
