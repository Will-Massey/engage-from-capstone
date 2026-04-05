/**
 * Two-Factor Authentication Setup Page
 * Guides users through 2FA setup with QR code and backup codes
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import {
  ShieldCheckIcon,
  QrCodeIcon,
  KeyIcon,
  ClipboardDocumentIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface TwoFactorSetupData {
  qrCodeUrl: string;
  secret: string;
  backupCodes: string[];
}

export const TwoFactorSetup: React.FC = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  
  const [step, setStep] = useState<'intro' | 'setup' | 'verify' | 'complete'>('intro');
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const handleStartSetup = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/auth/2fa/setup');
      setSetupData(response.data);
      setStep('setup');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to setup 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.post('/auth/2fa/verify', { token: verificationCode });
      updateUser({ ...user!, twoFactorEnabled: true });
      setStep('complete');
      toast.success('Two-factor authentication enabled!');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const copyBackupCodes = () => {
    if (setupData?.backupCodes) {
      navigator.clipboard.writeText(setupData.backupCodes.join('\n'));
      setCopiedCodes(true);
      toast.success('Backup codes copied to clipboard');
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  };

  const downloadBackupCodes = () => {
    if (setupData?.backupCodes) {
      const content = `Engage 2FA Backup Codes
Generated: ${new Date().toLocaleString()}

${setupData.backupCodes.join('\n')}

Keep these codes safe! Each code can only be used once.`;
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'engage-2fa-backup-codes.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Backup codes downloaded');
    }
  };

  // Intro Step
  if (step === 'intro') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <ShieldCheckIcon className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Secure Your Account
            </h2>
            <p className="mt-2 text-slate-600">
              Add an extra layer of security with two-factor authentication.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
            <h3 className="font-semibold text-slate-900">Why enable 2FA?</h3>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span>Protects your account even if your password is compromised</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span>Required for admin and partner accounts</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span>Complies with professional accounting security standards</span>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <Button
              onClick={handleStartSetup}
              isLoading={isLoading}
              size="lg"
              className="w-full"
            >
              Enable Two-Factor Auth
              <ArrowRightIcon className="w-4 h-4 ml-2" />
            </Button>
            
            <Button
              variant="ghost"
              onClick={() => navigate('/settings')}
              className="w-full"
            >
              Skip for Now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Setup Step - QR Code
  if (step === 'setup' && setupData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900">Scan QR Code</h2>
            <p className="mt-2 text-slate-600">
              Scan this code with your authenticator app
            </p>
          </div>

          {/* QR Code */}
          <div className="bg-white rounded-xl border border-slate-200 p-8">
            <div className="flex justify-center mb-6">
              <img
                src={setupData.qrCodeUrl}
                alt="2FA QR Code"
                className="w-48 h-48"
              />
            </div>

            {/* Manual Entry */}
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-sm text-slate-600 mb-2">
                Can't scan? Enter this code manually:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white px-3 py-2 rounded border text-sm font-mono break-all">
                  {setupData.secret}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(setupData.secret);
                    toast.success('Secret copied');
                  }}
                >
                  <ClipboardDocumentIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Backup Codes */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900">Save Your Backup Codes</h3>
                <p className="text-sm text-amber-700 mt-1">
                  These codes let you access your account if you lose your phone. 
                  Each code can only be used once.
                </p>

                <div className="grid grid-cols-2 gap-2 mt-4">
                  {setupData.backupCodes.map((code, index) => (
                    <code
                      key={index}
                      className="bg-white px-2 py-1 rounded text-sm font-mono text-center border border-amber-200"
                    >
                      {code}
                    </code>
                  ))}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={copyBackupCodes}
                    className="flex-1"
                  >
                    {copiedCodes ? 'Copied!' : 'Copy Codes'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={downloadBackupCodes}
                    className="flex-1"
                  >
                    Download
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <Button
            onClick={() => setStep('verify')}
            size="lg"
            className="w-full"
          >
            I've Saved My Codes
            <ArrowRightIcon className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // Verify Step
  if (step === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <KeyIcon className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">
              Verify Setup
            </h2>
            <p className="mt-2 text-slate-600">
              Enter the 6-digit code from your authenticator app to confirm everything is working.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
            <Input
              label="Verification Code"
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="text-center text-2xl tracking-widest"
              maxLength={6}
              autoComplete="one-time-code"
            />

            <Button
              onClick={handleVerify}
              isLoading={isLoading}
              disabled={verificationCode.length !== 6}
              size="lg"
              className="w-full"
            >
              Verify and Enable
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={() => setStep('setup')}
            className="w-full"
          >
            Back to QR Code
          </Button>
        </div>
      </div>
    );
  }

  // Complete Step
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <ShieldCheckIcon className="w-10 h-10 text-green-600" />
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Two-Factor Auth Enabled!
          </h2>
          <p className="mt-2 text-slate-600">
            Your account is now protected with an additional layer of security.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 text-left">
          <h3 className="font-semibold text-slate-900 mb-4">Important Reminders:</h3>
          <ul className="space-y-3 text-sm text-slate-600">
            <li className="flex items-start gap-3">
              <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span>You'll need your authenticator app every time you sign in</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span>Keep your backup codes in a safe place</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
              <span>You can disable 2FA in your security settings if needed</span>
            </li>
          </ul>
        </div>

        <Button
          onClick={() => navigate('/settings')}
          size="lg"
          className="w-full"
        >
          Go to Settings
        </Button>
      </div>
    </div>
  );
};

export default TwoFactorSetup;
