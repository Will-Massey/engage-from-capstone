import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { strongPasswordSchema } from '../../utils/passwordPolicy';
import { CheckIcon } from '@heroicons/react/24/solid';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import { AI_COPILOT } from '../../config/aiCopilot';
import toast from 'react-hot-toast';

const CLARA_ONBOARDING_KEY = 'engage-clara-onboarding';

export type ClaraOnboardingProfile = {
  practiceSize: string;
  clientTypes: string[];
  mtdStatus: string;
};

const onboardingSchema = z.object({
  subdomain: z
    .string()
    .min(3, 'Subdomain must be at least 3 characters')
    .max(30, 'Subdomain must be at most 30 characters')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers, and hyphens'),
  name: z.string().min(1, 'Practice name is required'),
  adminEmail: z.string().email('Please enter a valid email'),
  adminFirstName: z.string().min(1, 'First name is required'),
  adminLastName: z.string().min(1, 'Last name is required'),
  adminPassword: strongPasswordSchema,
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

const steps = [
  { id: 1, name: 'Practice Details' },
  { id: 2, name: `Meet ${AI_COPILOT.name}` },
  { id: 3, name: 'Admin Account' },
  { id: 4, name: 'Review' },
];

const PRACTICE_SIZES = [
  { value: 'solo', label: 'Solo practitioner' },
  { value: '2-5', label: '2–5 people' },
  { value: '6-20', label: '6–20 people' },
  { value: '20+', label: '20+ people' },
];

const CLIENT_TYPES = [
  { value: 'limited', label: 'Limited companies' },
  { value: 'sole_trader', label: 'Sole traders' },
  { value: 'partnership', label: 'Partnerships' },
  { value: 'mixed', label: 'Mixed client base' },
];

const MTD_OPTIONS = [
  { value: 'compliant', label: 'Most clients are MTD-ready' },
  { value: 'preparing', label: 'Preparing clients for MTD' },
  { value: 'not_started', label: 'MTD planning not started yet' },
];

async function persistClaraProfile(profile: ClaraOnboardingProfile) {
  localStorage.setItem(CLARA_ONBOARDING_KEY, JSON.stringify(profile));
  try {
    await apiClient.updateTenantSettings({ claraOnboarding: profile });
  } catch {
    // Tenant settings API may not accept claraOnboarding yet — localStorage is the fallback
  }
}

const Onboarding = () => {
  const navigate = useNavigate();
  const { setSession } = useAuthStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const [claraProfile, setClaraProfile] = useState<ClaraOnboardingProfile>({
    practiceSize: '',
    clientTypes: [],
    mtdStatus: '',
  });

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
      const response = (await apiClient.checkSubdomain(watchSubdomain)) as any;
      setSubdomainAvailable(response.data.available);
    } catch (error) {
      setSubdomainAvailable(false);
    }
  };

  const toggleClientType = (value: string) => {
    setClaraProfile((prev) => {
      const next = prev.clientTypes.includes(value)
        ? prev.clientTypes.filter((t) => t !== value)
        : [...prev.clientTypes, value];
      return { ...prev, clientTypes: next };
    });
  };

  const onSubmit = async (data: OnboardingForm) => {
    setIsLoading(true);
    try {
      const response = (await apiClient.createTenant({
        subdomain: data.subdomain,
        name: data.name,
        adminEmail: data.adminEmail,
        adminFirstName: data.adminFirstName,
        adminLastName: data.adminLastName,
        adminPassword: data.adminPassword,
      })) as any;

      if (response.success) {
        setSession(response.data.user, response.data.tenant);
        if (claraProfile.practiceSize && claraProfile.mtdStatus) {
          await persistClaraProfile(claraProfile);
        }
        toast.success(
          `Welcome to Engage! ${AI_COPILOT.name} will tailor proposals to your practice.`
        );
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
      if (!claraProfile.practiceSize) {
        toast.error('Please tell us your practice size');
        return;
      }
      if (!claraProfile.clientTypes.length) {
        toast.error('Please select at least one client type');
        return;
      }
      if (!claraProfile.mtdStatus) {
        toast.error('Please tell us your MTD status');
        return;
      }
      localStorage.setItem(CLARA_ONBOARDING_KEY, JSON.stringify(claraProfile));
      setCurrentStep(currentStep + 1);
      return;
    } else if (currentStep === 3) {
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
      <p className="text-slate-700 mb-6">Get started with your 7-day free trial</p>

      {/* Progress steps */}
      <div className="mb-8 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[520px]">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep > step.id
                    ? 'bg-primary-600 text-white'
                    : currentStep === step.id
                      ? step.id === 2
                        ? 'bg-violet-100 text-violet-700 border-2 border-violet-600'
                        : 'bg-primary-100 text-primary-700 border-2 border-primary-600'
                      : 'bg-slate-100 text-slate-600'
                }`}
              >
                {currentStep > step.id ? <CheckIcon className="w-5 h-5" /> : step.id}
              </div>
              <span
                className={`ml-2 text-sm font-medium whitespace-nowrap ${
                  currentStep >= step.id ? 'text-slate-900' : 'text-slate-600'
                }`}
              >
                {step.name}
              </span>
              {index < steps.length - 1 && <div className="w-8 h-0.5 mx-2 bg-slate-200" />}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Step 1: Practice Details */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <label className="block text-sm font-medium text-slate-800">Practice Name</label>
              <input
                {...register('name')}
                className="mt-1 input-field"
                placeholder="e.g., Smith & Associates"
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800">Subdomain</label>
              <div className="mt-1 flex rounded-lg shadow-sm">
                <input
                  {...register('subdomain')}
                  onBlur={checkSubdomain}
                  className="flex-1 rounded-l-lg border-r-0 input-field"
                  placeholder="your-practice"
                />
                <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 text-slate-600 text-sm">
                  .engage.capstonesoftware.co.uk
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

            <button type="button" onClick={nextStep} className="w-full btn-primary py-2.5">
              Continue
            </button>
          </div>
        )}

        {/* Step 2: Clara onboarding questions */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 rounded-xl bg-violet-500/15 border border-violet-400/25">
                  <SparklesIcon className="h-6 w-6 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Hi, I&apos;m {AI_COPILOT.name}</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Three quick questions help me suggest the right services, tone, and MTD wording
                    for your practice.
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-slate-800 mb-2">
                    How large is your practice?
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRACTICE_SIZES.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setClaraProfile((p) => ({ ...p, practiceSize: opt.value }))}
                        className={`text-left rounded-xl border p-3 text-sm transition-all ${
                          claraProfile.practiceSize === opt.value
                            ? 'border-violet-500 bg-violet-50 text-violet-900 ring-2 ring-violet-500/30'
                            : 'border-slate-200 hover:border-violet-300 bg-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-800 mb-2">
                    Who are your typical clients?
                  </p>
                  <p className="text-xs text-slate-500 mb-2">Select all that apply</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CLIENT_TYPES.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleClientType(opt.value)}
                        className={`text-left rounded-xl border p-3 text-sm transition-all ${
                          claraProfile.clientTypes.includes(opt.value)
                            ? 'border-violet-500 bg-violet-50 text-violet-900 ring-2 ring-violet-500/30'
                            : 'border-slate-200 hover:border-violet-300 bg-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-800 mb-2">
                    Making Tax Digital (MTD) for ITSA
                  </p>
                  <div className="space-y-2">
                    {MTD_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setClaraProfile((p) => ({ ...p, mtdStatus: opt.value }))}
                        className={`w-full text-left rounded-xl border p-3 text-sm transition-all ${
                          claraProfile.mtdStatus === opt.value
                            ? 'border-violet-500 bg-violet-50 text-violet-900 ring-2 ring-violet-500/30'
                            : 'border-slate-200 hover:border-violet-300 bg-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button type="button" onClick={prevStep} className="flex-1 btn-secondary py-2.5">
                Back
              </button>
              <button
                type="button"
                onClick={nextStep}
                className="flex-1 btn-primary py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
              >
                Continue with {AI_COPILOT.shortName}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Admin Account */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-800">First Name</label>
                <input {...register('adminFirstName')} className="mt-1 input-field" />
                {errors.adminFirstName && (
                  <p className="mt-1 text-sm text-red-600">{errors.adminFirstName.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-800">Last Name</label>
                <input {...register('adminLastName')} className="mt-1 input-field" />
                {errors.adminLastName && (
                  <p className="mt-1 text-sm text-red-600">{errors.adminLastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800">Email Address</label>
              <input {...register('adminEmail')} type="email" className="mt-1 input-field" />
              {errors.adminEmail && (
                <p className="mt-1 text-sm text-red-600">{errors.adminEmail.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800">Password</label>
              <input {...register('adminPassword')} type="password" className="mt-1 input-field" />
              {errors.adminPassword && (
                <p className="mt-1 text-sm text-red-600">{errors.adminPassword.message}</p>
              )}
            </div>

            <div className="flex space-x-3">
              <button type="button" onClick={prevStep} className="flex-1 btn-secondary py-2.5">
                Back
              </button>
              <button type="button" onClick={nextStep} className="flex-1 btn-primary py-2.5">
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-fade-in">
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div>
                <span className="text-sm text-slate-600">Practice:</span>
                <p className="font-medium">{watch('name')}</p>
              </div>
              <div>
                <span className="text-sm text-slate-600">Subdomain:</span>
                <p className="font-medium">{watch('subdomain')}.engage.capstonesoftware.co.uk</p>
              </div>
              <div>
                <span className="text-sm text-slate-600">Admin:</span>
                <p className="font-medium">
                  {watch('adminFirstName')} {watch('adminLastName')} ({watch('adminEmail')})
                </p>
              </div>
              <div className="pt-2 border-t border-slate-200">
                <span className="text-sm text-slate-600">{AI_COPILOT.name} profile:</span>
                <p className="text-sm font-medium mt-1">
                  {PRACTICE_SIZES.find((s) => s.value === claraProfile.practiceSize)?.label} ·{' '}
                  {claraProfile.clientTypes
                    .map((t) => CLIENT_TYPES.find((c) => c.value === t)?.label)
                    .filter(Boolean)
                    .join(', ')}{' '}
                  · {MTD_OPTIONS.find((m) => m.value === claraProfile.mtdStatus)?.label}
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
                <a href="#" className="text-primary-600 hover:text-primary-500">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-primary-600 hover:text-primary-500">
                  Privacy Policy
                </a>
              </label>
            </div>

            <div className="flex space-x-3">
              <button type="button" onClick={prevStep} className="flex-1 btn-secondary py-2.5">
                Back
              </button>
              <button type="submit" disabled={isLoading} className="flex-1 btn-primary py-2.5">
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
