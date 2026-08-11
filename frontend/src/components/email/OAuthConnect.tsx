import { useState, useEffect } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';
import { isApprover } from '../../constants/roles';

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
    color: 'bg-primary-50 border-primary-200 text-primary-900',
    buttonColor: 'bg-primary-600 hover:bg-primary-700',
  },
};

const OAuthConnect = ({ provider, onConnected }: OAuthConnectProps) => {
  // Disconnect is authorize('ADMIN','PARTNER','MANAGER') on the backend
  // (email.ts /auth/:provider/disconnect) — mirror it here so a SENIOR sees
  // the connected status without a button that 403s.
  const canManage = isApprover(useAuthStore((s) => s.user?.role));
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const config = providerConfig[provider];

  // onConnected fires on an actual connection event only — calling it from the
  // mount-time status check gave every already-connected practice a phantom
  // "connected" toast on each page load.
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = (await apiClient.get(`/email/auth/${provider}/status`)) as any;
        if (response.success) {
          setStatus(response.data);
        }
      } catch (error) {
        // Status check failed, assume not connected
      } finally {
        setIsLoading(false);
      }
    };

    checkStatus();
  }, [provider]);

  // Check for OAuth callback (server exchanges code — frontend only sees success flag)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauth = urlParams.get('oauth');
    const urlProvider = urlParams.get('provider');
    const error = urlParams.get('error');

    // Xero and QuickBooks land on the same pages with the same query params, so
    // only claim a callback that names this mailbox provider — except
    // 'invalid_provider', the one mailbox error the backend can't attach a
    // provider to (the :provider route param itself was invalid).
    if (error && (urlProvider === provider || (!urlProvider && error === 'invalid_provider'))) {
      toast.error(`OAuth failed: ${error}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (oauth === 'success' && urlProvider === provider) {
      setStatus({ isConnected: true, provider });
      // onConnected owns the success toast — MailboxConnect's callback fires
      // one with the mailbox's friendly label; firing another here duplicated it.
      onConnected();
      // Drop the oauth params, keep the page we're on. There has never been a
      // 'email' Settings tab and the id is meaningless on /integrations.
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [provider, onConnected]);

  const initiateOAuth = async () => {
    setIsConnecting(true);
    try {
      // Tell the backend where to send the user back after the round-trip —
      // /integrations is now the primary place to connect a mailbox, but this
      // widget is also mounted on Settings > Communications.
      const returnTo = window.location.pathname.startsWith('/integrations')
        ? 'integrations'
        : 'settings';
      const response = (await apiClient.get(
        `/email/auth/${provider}/url?returnTo=${returnTo}`
      )) as any;
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
              {canManage && (
                <button
                  onClick={disconnect}
                  className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
                >
                  Disconnect
                </button>
              )}
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
