import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

const registerSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  tenantId: z.string().min(1, 'Tenant is required'),
});

type RegisterForm = z.infer<typeof registerSchema>;

const Register = () => {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const password = watch('password', '');

  // Password requirements check
  const passwordRequirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
    { label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const onSubmit = async (data: RegisterForm) => {
    setIsLoading(true);
    try {
      const response = await apiClient.register({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        tenantId: data.tenantId,
      }) as any;

      if (response.success) {
        setAuth(response.data.user, response.data.user.tenant, response.data.tokens.accessToken);
        toast.success('Account created successfully!');
        navigate('/');
      }
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Create your account</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-800">First Name</label>
            <input
              {...register('firstName')}
              className="mt-1 input-field"
              placeholder="John"
            />
            {errors.firstName && (
              <p className="mt-1 text-sm text-red-600">{errors.firstName.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800">Last Name</label>
            <input
              {...register('lastName')}
              className="mt-1 input-field"
              placeholder="Doe"
            />
            {errors.lastName && (
              <p className="mt-1 text-sm text-red-600">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800">Email address</label>
          <input
            {...register('email')}
            type="email"
            className="mt-1 input-field"
            placeholder="you@company.com"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800">Password</label>
          <div className="mt-1 relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              className="input-field pr-10"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
          )}
          {/* Password Requirements */}
          <div className="mt-3 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs font-medium text-slate-800 mb-2">Password requirements:</p>
            <div className="space-y-1">
              {passwordRequirements.map((req, i) => (
                <div key={i} className="flex items-center text-xs">
                  {req.met ? (
                    <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
                  ) : (
                    <XCircleIcon className="h-4 w-4 text-slate-400 mr-2" />
                  )}
                  <span className={req.met ? 'text-green-700' : 'text-slate-600'}>{req.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-800">Tenant ID</label>
          <input
            {...register('tenantId')}
            className="mt-1 input-field"
            placeholder="Enter tenant ID"
          />
          {errors.tenantId && (
            <p className="mt-1 text-sm text-red-600">{errors.tenantId.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full btn-primary py-2.5"
        >
          {isLoading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-700">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
          Sign in
        </Link>
      </p>
    </div>
  );
};

export default Register;
