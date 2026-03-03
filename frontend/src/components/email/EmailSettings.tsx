import { useState, useEffect } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import { EnvelopeIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

type EmailProvider = 'smtp' | 'gmail' | 'outlook' | 'microsoft365';

interface EmailConfig {
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  gmail?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    user: string;
  };
  outlook?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    user: string;
  };
}

const EmailSettings = () => {
  const [config, setConfig] = useState<EmailConfig>({
    provider: 'smtp',
    fromName: '',
    fromEmail: '',
    smtp: {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'untested' | 'success' | 'error'>('untested');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await apiClient.get('/email/config') as any;
      if (response.success && response.data.isConfigured) {
        setConfig({
          provider: response.data.provider,
          fromName: response.data.fromName,
          fromEmail: response.data.fromEmail,
          smtp: response.data.smtp || config.smtp,
        });
        setConnectionStatus('success');
      }
    } catch (error) {
      // Config might not exist yet
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await apiClient.put('/email/config', config) as any;
      if (response.success) {
        toast.success('Email settings saved');
        setConnectionStatus(response.data.connectionTest.success ? 'success' : 'error');
        if (!response.data.connectionTest.success) {
          toast.error(`Connection failed: ${response.data.connectionTest.error}`);
        }
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast.error('Please enter a test email address');
      return;
    }

    setIsTesting(true);
    try {
      const response = await apiClient.post('/email/test', { testEmail }) as any;
      if (response.success) {
        toast.success('Test email sent successfully');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to send test email');
    } finally {
      setIsTesting(false);
    }
  };

  const providers = [
    { value: 'smtp', label: 'SMTP Server', description: 'Generic email server' },
    { value: 'gmail', label: 'Gmail / Google Workspace', description: 'OAuth2 authentication' },
    { value: 'outlook', label: 'Outlook.com', description: 'Microsoft OAuth2' },
    { value: 'microsoft365', label: 'Microsoft 365', description: 'Business Microsoft accounts' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Email Configuration</h3>
        <p className="mt-1 text-sm text-gray-500">
          Configure email settings for sending proposals and notifications
        </p>
      </div>

      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Email Provider</label>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {providers.map((provider) => (
            <button
              key={provider.value}
              type="button"
              onClick={() => setConfig({ ...config, provider: provider.value as EmailProvider })}
              className={`p-3 rounded-lg border-2 text-left transition-colors ${
                config.provider === provider.value
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-primary-300'
              }`}
            >
              <span className="font-medium text-gray-900">{provider.label}</span>
              <p className="text-xs text-gray-500">{provider.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* From Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">From Name</label>
          <input
            type="text"
            value={config.fromName}
            onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
            placeholder="Your Practice Name"
            className="mt-1 input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">From Email</label>
          <input
            type="email"
            value={config.fromEmail}
            onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
            placeholder="noreply@yourpractice.co.uk"
            className="mt-1 input-field"
          />
        </div>
      </div>

      {/* SMTP Settings */}
      {config.provider === 'smtp' && (
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900">SMTP Settings</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Host</label>
              <input
                type="text"
                value={config.smtp?.host}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    smtp: { ...config.smtp!, host: e.target.value },
                  })
                }
                placeholder="smtp.gmail.com"
                className="mt-1 input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Port</label>
              <input
                type="number"
                value={config.smtp?.port}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    smtp: { ...config.smtp!, port: parseInt(e.target.value) },
                  })
                }
                placeholder="587"
                className="mt-1 input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                value={config.smtp?.user}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    smtp: { ...config.smtp!, user: e.target.value },
                  })
                }
                placeholder="your-email@gmail.com"
                className="mt-1 input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                value={config.smtp?.pass}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    smtp: { ...config.smtp!, pass: e.target.value },
                  })
                }
                placeholder="••••••••"
                className="mt-1 input-field"
              />
            </div>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="secure"
              checked={config.smtp?.secure}
              onChange={(e) =>
                setConfig({
                  ...config,
                  smtp: { ...config.smtp!, secure: e.target.checked },
                })
              }
              className="h-4 w-4 text-primary-600 rounded"
            />
            <label htmlFor="secure" className="ml-2 text-sm text-gray-700">
              Use secure connection (TLS/SSL)
            </label>
          </div>
        </div>
      )}

      {/* OAuth Providers */}
      {(config.provider === 'gmail' || config.provider === 'outlook' || config.provider === 'microsoft365') && (
        <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <h4 className="font-medium text-yellow-900">
            {config.provider === 'gmail' ? 'Gmail' : 'Microsoft'} OAuth2 Setup
          </h4>
          <p className="mt-1 text-sm text-yellow-700">
            OAuth2 configuration requires setup in the Google/Microsoft Developer Console.
            Contact your administrator to configure OAuth2 credentials.
          </p>
        </div>
      )}

      {/* Connection Status */}
      {connectionStatus !== 'untested' && (
        <div
          className={`p-4 rounded-lg flex items-center ${
            connectionStatus === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {connectionStatus === 'success' ? (
            <CheckCircleIcon className="h-5 w-5 mr-2" />
          ) : (
            <ExclamationCircleIcon className="h-5 w-5 mr-2" />
          )}
          <span>
            {connectionStatus === 'success'
              ? 'Connection verified successfully'
              : 'Connection failed - check your settings'}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-gray-200">
        <button onClick={handleSave} disabled={isSaving} className="btn-primary">
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>

        {connectionStatus === 'success' && (
          <div className="flex items-center space-x-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              className="input-field w-48"
            />
            <button
              onClick={handleTest}
              disabled={isTesting}
              className="btn-secondary"
            >
              {isTesting ? 'Sending...' : 'Send Test'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailSettings;
