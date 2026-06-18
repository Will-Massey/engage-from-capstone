import { useState, useEffect } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

type OAuthProvider = 'gmail' | 'outlook' | 'microsoft365';

interface OAuthConnectProps {
  provider: OAuthProvider;
  onConnected: () => void;
}

interface OAuthStatus {
  isConnected: boolean;
  user?: string;
  provider: string;
}

const providerConfig = {
  gmail: {
    name: 'Gmail',
    icon: 'https://www.google.com/favicon.ico',
    color: 'bg-red-50 border-red-200 text-red-900',
    buttonColor: 'bg-red-600 hover:bg-red-700',
  },
  outlook: {
    name: 'Outlook.com',
    icon: 'https://outlook.live.com/favicon.ico',
    color: 'bg-blue-50 border-blue-200 text-blue-900',
    buttonColor: 'bg-blue-600 hover:bg-blue-700',
  },
  microsoft365: {
    name: 'Microsoft 365',
    icon: 'https://www.microsoft.com/favicon.ico',
    color: 'bg-indigo-50 border-indigo-200 text-indigo-900',
    buttonColor: 'bg-indigo-600 hover:bg-indigo-700',
  },
};

const OAuthConnect = ({ provider, onConnected }: OAuthConnectProps) => {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const config = providerConfig[provider];

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = (await apiClient.get(`/email/auth/${provider}/status`)) as any;
        if (response.success) {
          setStatus(response.data);
          if (response.data.isConnected) {
            onConnected();
          }
        }
      } catch (error) {
        // Status check failed, assume not connected
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, [provider, onConnected]);

  // Check for OAuth callback (server exchanges code — frontend only sees success flag)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauth = urlParams.get('oauth');
    const urlProvider = urlParams.get('provider');
    const error = urlParams.get('error');

    if (error) {
      toast.error(`OAuth failed: ${error}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (oauth === 'success' && urlProvider === provider) {
      toast.success(`${providerConfig[provider].name} connected successfully!`);
      setStatus({ isConnected: true, provider });
      onConnected();
      window.history.replaceState({}, document.title, `${window.location.pathname}?tab=email`);
    }
  }, [provider, onConnected]);

  const initiateOAuth = async () => {
    setIsConnecting(true);
    try {
      const response = (await apiClient.get(`/email/auth/${provider}/url`)) as any;
      if (response.success && response.data.url) {
        window.location.href = response.data.url;
      } else {
        toast.error('Failed to get OAuth URL');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to initiate OAuth');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      const response = (await apiClient.post(`/email/auth/${provider}/disconnect`, {})) as any;
      if (response.success) {
        toast.success(`${config.name} disconnected`);
        setStatus({ isConnected: false, provider });
      }
    } catch (error: any) {
      toast.error('Failed to disconnect');
    }
  };

  if (isLoading) {
    return (
      <div className={`p-4 rounded-lg border ${config.color}`}>
        <div className="flex items-center justify-center h-16">
          <ArrowPathIcon className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-lg border ${config.color}`}>
      <div className="flex items-start space-x-4">
        <img
          src={config.icon}
          alt={config.name}
          className="w-10 h-10 rounded"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="flex-1">
          <h4 className="font-medium">{config.name} Integration</h4>

          {status?.isConnected ? (
            <>
              <div className="mt-2 flex items-center text-sm">
                <CheckCircleIcon className="h-4 w-4 mr-1 text-green-600" />
                <span className="text-green-700">Connected</span>
                {status.user && <span className="ml-2 text-gray-500">({status.user})</span>}
              </div>
              <button
                onClick={disconnect}
                className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm opacity-80">
                Connect your {config.name} account to send proposals and emails directly from the
                platform.
              </p>
              <button
                onClick={initiateOAuth}
                disabled={isConnecting}
                className={`mt-3 inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 ${config.buttonColor}`}
              >
                {isConnecting ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect {config.name}
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 ml-2" />
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Help Text */}
      {!status?.isConnected && (
        <div className="mt-4 pt-4 border-t border-current border-opacity-20">
          <p className="text-xs opacity-70">
            <strong>What happens next?</strong>
            <br />
            You'll be redirected to {config.name} to authorize access. We only request permission to
            send emails on your behalf.
          </p>
        </div>
      )}
    </div>
  );
};

export default OAuthConnect;
