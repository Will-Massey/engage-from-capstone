import { useState, useEffect } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  CloudIcon,
} from '@heroicons/react/24/outline';
import OAuthConnect from './OAuthConnect';

type EmailProvider = 'smtp' | 'gmail' | 'outlook' | 'microsoft365';

interface EmailConfig {
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;
  replyToEmail?: string;
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

interface PlatformStatus {
  mode: 'custom' | 'platform';
  platformReady: boolean;
  customReady: boolean;
  replyTo: string | null;
  platformFrom: string;
  customFrom: string | null;
  provider: string;
}

interface EmailLogEntry {
  id: string;
  messageType: string;
  provider: string;
  status: string;
  to: string;
  subject: string;
  error?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'DELIVERED':
    case 'SENT':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'QUEUED':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'BOUNCED':
    case 'FAILED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'SUPPRESSED':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const EmailSettings = () => {
  const [config, setConfig] = useState<EmailConfig>({
    provider: 'smtp',
    fromName: '',
    fromEmail: '',
    replyToEmail: '',
    smtp: {
      host: '',
      port: 587,
      secure: false,
      user: '',
      pass: '',
    },
  });
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'untested' | 'success' | 'error'>(
    'untested'
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const loadLogs = async () => {
    try {
      const response = (await apiClient.get('/email/logs?limit=50')) as any;
      if (response.success) {
        setLogs(response.data);
      }
    } catch {
      // Non-fatal
    }
  };

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = (await apiClient.get('/email/config')) as any;
        if (response.success) {
          setPlatform(response.data.platform || null);
          if (response.data.isConfigured) {
            setConfig((prev) => ({
              ...prev,
              provider: response.data.provider,
              fromName: response.data.fromName,
              fromEmail: response.data.fromEmail,
              replyToEmail: response.data.replyToEmail || response.data.platform?.replyTo || '',
              smtp: response.data.smtp || prev.smtp,
            }));
            setConnectionStatus('success');
            setShowAdvanced(true);
          } else if (response.data.replyToEmail || response.data.platform?.replyTo) {
            setConfig((prev) => ({
              ...prev,
              replyToEmail: response.data.replyToEmail || response.data.platform?.replyTo || '',
            }));
          }
        }
        await loadLogs();
      } catch {
        // Config might not exist yet
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = (await apiClient.put('/email/config', config)) as any;
      if (response.success) {
        toast.success('Email settings saved');
        setConnectionStatus(response.data.connectionTest.success ? 'success' : 'error');
        if (!response.data.connectionTest.success) {
          toast.error(`Connection failed: ${response.data.connectionTest.error}`);
        }
        const statusRes = (await apiClient.get('/email/status')) as any;
        if (statusRes.success) setPlatform(statusRes.data);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveReplyTo = async () => {
    if (!config.replyToEmail) {
      toast.error('Please enter a Reply-To email');
      return;
    }
    setIsSaving(true);
    try {
      const response = (await apiClient.put('/email/reply-to', {
        replyToEmail: config.replyToEmail,
      })) as any;
      if (response.success) {
        toast.success('Reply-To address saved');
        const statusRes = (await apiClient.get('/email/status')) as any;
        if (statusRes.success) setPlatform(statusRes.data);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to save Reply-To');
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
      const response = (await apiClient.post('/email/test', { testEmail })) as any;
      if (response.success) {
        toast.success(
          `Test email sent via ${response.data.provider || 'platform'} — check your inbox`
        );
        await loadLogs();
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

  const usingPlatform = platform?.mode === 'platform' || !platform?.customReady;
  const canSend = platform?.platformReady || platform?.customReady;

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
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Email Configuration</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Client emails send automatically via Capstone. Replies go to your practice inbox.
        </p>
      </div>

      {/* Platform status card */}
      <div
        className={`p-4 rounded-lg border flex items-start gap-3 ${
          usingPlatform
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
            : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
        }`}
      >
        <CloudIcon
          className={`h-6 w-6 flex-shrink-0 ${usingPlatform ? 'text-green-600' : 'text-blue-600'}`}
        />
        <div className="flex-1 min-w-0">
          {usingPlatform ? (
            <>
              <p className="font-medium text-green-900 dark:text-green-100">
                Client emails send via <strong>Capstone</strong>
              </p>
              <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                From: {platform?.platformFrom || 'notifications@engage.capstonesoftware.co.uk'}
                {platform?.replyTo && (
                  <>
                    {' '}
                    · Reply-To: <span className="font-mono">{platform.replyTo}</span>
                  </>
                )}
              </p>
              {!platform?.platformReady && (
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                  Platform email not configured on server (SENDGRID_API_KEY missing).
                </p>
              )}
            </>
          ) : (
            <>
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Using your custom mail connection
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                From: {platform?.customFrom || config.fromEmail} ({platform?.provider})
              </p>
            </>
          )}
        </div>
      </div>

      {/* Reply-To */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Reply-To address
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            When clients hit reply, messages go here (your practice or partner inbox).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            value={config.replyToEmail || ''}
            onChange={(e) => setConfig({ ...config, replyToEmail: e.target.value })}
            placeholder="partner@yourpractice.co.uk"
            className="input-field flex-1 min-w-[200px]"
          />
          <button
            type="button"
            onClick={handleSaveReplyTo}
            disabled={isSaving}
            className="btn-secondary"
          >
            Save Reply-To
          </button>
        </div>
      </div>

      {/* Test send — always available when transport is ready */}
      {canSend && (
        <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Send test email</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Uses the same delivery path as proposals and touchpoints.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@yourpractice.co.uk"
              className="input-field w-56"
            />
            <button onClick={handleTest} disabled={isTesting} className="btn-secondary">
              {isTesting ? 'Sending...' : 'Send Test'}
            </button>
          </div>
        </div>
      )}

      {/* Delivery log */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-900 dark:text-gray-100">Recent delivery log</h4>
          <button type="button" onClick={loadLogs} className="text-sm text-primary-600 hover:underline">
            Refresh
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No emails sent yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                    When
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                    To
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                    Subject
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">
                      {new Date(log.sentAt || log.createdAt).toLocaleString('en-GB', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-3 py-2 max-w-[140px] truncate" title={log.to}>
                      {log.to}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={log.subject}>
                      {log.subject}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(log.status)}`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Advanced custom email */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          {showAdvanced ? 'Hide' : 'Show'} advanced: use your own mail server
        </button>
      </div>

      {showAdvanced && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email Provider
            </label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {providers.map((provider) => (
                <button
                  key={provider.value}
                  type="button"
                  onClick={() => setConfig({ ...config, provider: provider.value as EmailProvider })}
                  className={`p-3 rounded-lg border-2 text-left transition-colors ${
                    config.provider === provider.value
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
                  }`}
                >
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {provider.label}
                  </span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{provider.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                From Name
              </label>
              <input
                type="text"
                value={config.fromName}
                onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                placeholder="Your Practice Name"
                className="mt-1 input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                From Email
              </label>
              <input
                type="email"
                value={config.fromEmail}
                onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
                placeholder="sales@yourpractice.co.uk"
                className="mt-1 input-field"
              />
            </div>
          </div>

          {config.provider === 'smtp' && (
            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">SMTP Settings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Host
                  </label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Port
                  </label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Username
                  </label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password
                  </label>
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
                <label htmlFor="secure" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Use secure connection (TLS/SSL)
                </label>
              </div>
            </div>
          )}

          {(config.provider === 'gmail' ||
            config.provider === 'outlook' ||
            config.provider === 'microsoft365') && (
            <OAuthConnect
              provider={config.provider}
              onConnected={() => {
                setConnectionStatus('success');
                toast.success(
                  `${config.provider === 'gmail' ? 'Gmail' : 'Microsoft 365'} connected successfully`
                );
              }}
            />
          )}

          {connectionStatus !== 'untested' && (
            <div
              className={`p-4 rounded-lg flex items-center ${
                connectionStatus === 'success'
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300'
                  : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
              }`}
            >
              {connectionStatus === 'success' ? (
                <CheckCircleIcon className="h-5 w-5 mr-2" />
              ) : (
                <ExclamationCircleIcon className="h-5 w-5 mr-2" />
              )}
              <span>
                {connectionStatus === 'success'
                  ? 'Custom connection verified'
                  : 'Connection failed — check your settings'}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button onClick={handleSave} disabled={isSaving} className="btn-primary">
              {isSaving ? 'Saving...' : 'Save Custom Settings'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default EmailSettings;
