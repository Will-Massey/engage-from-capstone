/**
 * Two-Factor Authentication Setup Wizard
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheckIcon,
  ClipboardDocumentIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';

type SetupStep = 'loading' | 'scan' | 'verify' | 'complete';

export const TwoFactorSetup: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const [step, setStep] = useState<SetupStep>('loading');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [codesCopied, setCodesCopied] = useState(false);

  useEffect(() => {
    const initSetup = async () => {
      if (user?.twoFactorEnabled) {
        navigate('/settings?tab=security');
        return;
      }

      setIsLoading(true);
      try {
        const response = (await apiClient.post('/auth/2fa/setup')) as any;
        if (response.success) {
          setQrCodeUrl(response.data.qrCodeUrl);
          setBackupCodes(response.data.backupCodes);
          setStep('scan');
        }
      } catch (error: any) {
        toast.error(error.response?.data?.error?.message || 'Failed to start 2FA setup');
        navigate('/settings?tab=security');
      } finally {
        setIsLoading(false);
      }
    };

    initSetup();
  }, [user?.twoFactorEnabled, navigate]);

  const handleCopyBackupCodes = async () => {
    const text = backupCodes.join('\n');
    await navigator.clipboard.writeText(text);
    setCodesCopied(true);
    toast.success('Backup codes copied to clipboard');
    setTimeout(() => setCodesCopied(false), 3000);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (verificationCode.length < 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    setIsLoading(true);
    try {
      const response = (await apiClient.post('/auth/2fa/verify', {
        token: verificationCode,
      })) as any;

      if (response.success) {
        updateUser({ twoFactorEnabled: true });
        setStep('complete');
        toast.success('Two-factor authentication enabled!');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-slate-600">Preparing two-factor authentication...</p>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">2FA Enabled</h2>
            <p className="mt-2 text-slate-600">
              Your account is now protected with two-factor authentication.
            </p>
          </div>
          <Button onClick={() => navigate('/settings?tab=security')} className="w-full">
            Back to Security Settings
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-lg mx-auto space-y-8">
        <div className="text-center">
          <ShieldCheckIcon className="mx-auto h-12 w-12 text-primary-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Set up two-factor authentication</h1>
          <p className="mt-2 text-slate-600">
            Use an authenticator app such as Google Authenticator or Microsoft Authenticator.
          </p>
        </div>

        {step === 'scan' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-4">Scan this QR code with your authenticator app:</p>
              {qrCodeUrl && (
                <img
                  src={qrCodeUrl}
                  alt="2FA QR code"
                  className="mx-auto w-48 h-48 border border-slate-200 rounded-lg"
                />
              )}
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-slate-900 mb-2">Save your backup codes</h3>
              <p className="text-sm text-slate-600 mb-4">
                Store these codes somewhere safe. Each can be used once if you lose access to your
                authenticator app.
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-slate-50 p-4 rounded-lg">
                {backupCodes.map((code) => (
                  <span key={code} className="text-slate-700">
                    {code}
                  </span>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={handleCopyBackupCodes}
                className="mt-4 w-full"
              >
                <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
                {codesCopied ? 'Copied!' : 'Copy backup codes'}
              </Button>
            </div>

            <Button onClick={() => setStep('verify')} className="w-full">
              I&apos;ve saved my backup codes — continue
            </Button>
          </div>
        )}

        {step === 'verify' && (
          <form
            onSubmit={handleVerify}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6"
          >
            <div>
              <h3 className="font-semibold text-slate-900 mb-2">Verify your authenticator</h3>
              <p className="text-sm text-slate-600">
                Enter the 6-digit code from your authenticator app to complete setup.
              </p>
            </div>

            <Input
              label="Verification code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoComplete="one-time-code"
              required
            />

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep('scan')}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                type="submit"
                isLoading={isLoading}
                disabled={verificationCode.length !== 6}
                className="flex-1"
              >
                Enable 2FA
              </Button>
            </div>
          </form>
        )}

        <div className="text-center">
          <Link
            to="/settings?tab=security"
            className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeftIcon className="w-4 h-4 mr-1" />
            Cancel and return to settings
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TwoFactorSetup;