/**
 * Verify Email Page
 * Confirms a user's email address using the token from the verification email
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import { EnvelopeIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

type VerifyState = 'verifying' | 'success' | 'error';

export const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [state, setState] = useState<VerifyState>(token ? 'verifying' : 'error');
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    const verify = async () => {
      try {
        await apiClient.verifyEmail(token);
        setState('success');
        toast.success('Email verified! You can now sign in.');

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      } catch (error: any) {
        setState('error');
        toast.error(
          error.response?.data?.error?.message ||
            'This verification link is invalid or has expired.'
        );
      }
    };

    verify();
  }, [token, navigate]);

  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="w-8 h-8 text-green-600" />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-900">Email verified!</h2>
            <p className="mt-2 text-slate-600">
              Your email has been verified successfully. You&apos;ll be redirected to the login
              page.
            </p>
          </div>

          <Link to="/login">
            <Button variant="primary" className="w-full">
              Go to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <XCircleIcon className="w-8 h-8 text-red-600" />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-900">Invalid Verification Link</h2>
            <p className="mt-2 text-slate-600">
              This verification link is invalid or has expired. Sign in with your email and password
              to request a new one.
            </p>
          </div>

          <Link to="/login">
            <Button variant="primary" className="w-full">
              Back to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <EnvelopeIcon className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-slate-900">Verifying your email…</h2>
          <p className="mt-2 text-slate-600">This will only take a moment.</p>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
