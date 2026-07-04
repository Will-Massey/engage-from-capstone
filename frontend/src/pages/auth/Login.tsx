import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { apiClient, clearCsrfCache, rememberCsrfToken } from '../../utils/api';
import { appPath } from '../../utils/appBase';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

type LoginForm = z.infer<typeof loginSchema>;

const Login = () => {
  const navigate = useNavigate();
  const { setSession, clearAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingToken, setPendingToken] = useState('');
  const [totpToken, setTotpToken] = useState('');

  useEffect(() => {
    clearAuth();
    clearCsrfCache();
  }, [clearAuth]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response = (await apiClient.login(data.email, data.password, {
        rememberMe: data.rememberMe,
      })) as any;

      if (response.success) {
        if (response.data.requires2FA && response.data.pendingToken) {
          setPendingToken(response.data.pendingToken);
          setRequires2FA(true);
          toast.success('Please enter your authenticator code');
          return;
        }

        setSession(response.data.user, response.data.user.tenant);
        rememberCsrfToken(response.data.csrfToken);
        toast.success('Welcome to Engage!');
        window.location.assign(appPath('/'));
        return;
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Sign-in failed. Please check your email and password.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (totpToken.length < 6) {
      toast.error('Please enter your 6-digit code');
      return;
    }

    setIsLoading(true);
    try {
      const response = (await apiClient.post('/auth/2fa/login', {
        pendingToken,
        totpToken,
      })) as any;

      if (response.success) {
        setSession(response.data.user, response.data.user.tenant);
        rememberCsrfToken(response.data.csrfToken);
        toast.success('Welcome to Engage!');
        window.location.assign(appPath('/'));
        return;
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: string }).message)
          : 'Verification failed. Please try again.';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (requires2FA) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheckIcon className="h-8 w-8 text-primary-600" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Two-factor authentication
          </h2>
        </div>
        <p className="text-slate-600 dark:text-slate-300 mb-6">
          Enter the 6-digit code from your authenticator app, or use a backup code.
        </p>

        <form onSubmit={handle2FASubmit} className="space-y-5">
          <div>
            <label
              htmlFor="totpToken"
              className="block text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              Verification code
            </label>
            <div className="mt-1">
              <input
                id="totpToken"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value.replace(/\s/g, '').toUpperCase())}
                className="input-field"
                placeholder="000000"
                autoFocus
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || totpToken.length < 6}
            className="w-full btn-primary py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
          >
            {isLoading ? 'Verifying...' : 'Verify and sign in'}
          </button>

          <button
            type="button"
            onClick={() => {
              setRequires2FA(false);
              setPendingToken('');
              setTotpToken('');
            }}
            className="w-full text-sm text-slate-600 hover:text-slate-900"
          >
            Back to sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Welcome back</h2>
      <p className="text-slate-600 dark:text-slate-300 mb-6">Sign in to your Engage account</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Email address
          </label>
          <div className="mt-1">
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              className={errors.email ? 'input-field-error' : 'input-field'}
              placeholder="you@company.com"
            />
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
          </div>
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            Password
          </label>
          <div className="mt-1 relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={errors.password ? 'input-field-error pr-10' : 'input-field pr-10'}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showPassword ? (
                <EyeSlashIcon className="h-5 w-5" />
              ) : (
                <EyeIcon className="h-5 w-5" />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <input
              {...register('rememberMe')}
              type="checkbox"
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-slate-300 rounded"
            />
            <label
              htmlFor="remember-me"
              className="ml-2 block text-sm text-slate-700 dark:text-slate-300"
            >
              Remember me
            </label>
          </div>
          <div className="text-sm">
            <Link to="/forgot-password" className="font-medium text-primary-600 hover:text-primary-500">
              Forgot password?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full btn-primary py-2.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800"
        >
          {isLoading ? (
            <>
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Signing in...
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      {import.meta.env.DEV && (
        <div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-100">
          <p className="text-sm text-primary-800">
            <strong>Demo credentials:</strong>
            <br />
            Email: admin@demo.practice
            <br />
            Password: DemoPass123!
          </p>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-700 dark:text-slate-300">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-medium text-primary-600 hover:text-primary-500">
          Start your free trial
        </Link>
      </p>
    </div>
  );
};

export default Login;