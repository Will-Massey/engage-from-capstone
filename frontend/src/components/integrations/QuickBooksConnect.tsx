import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface QuickBooksStatus {
  connected: boolean;
  configured: boolean;
  realmId?: string;
  companyName?: string;
  connectedAt?: string;
  scaffold?: boolean;
  note?: string;
}

const QuickBooksConnect = () => {
  const [status, setStatus] = useState<QuickBooksStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = (await apiClient.getQuickBooksStatus()) as any;
      if (response.success) {
        setStatus(response.data);
      }
    } catch {
      setStatus({ connected: false, configured: false });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauth = urlParams.get('oauth');
    const provider = urlParams.get('provider');
    const error = urlParams.get('error');

    if (error && provider === 'quickbooks') {
      toast.error(`QuickBooks connection failed: ${error}`);
      window.history.replaceState({}, document.title, '/settings?tab=integrations');
      return;
    }

    if (oauth === 'success' && provider === 'quickbooks') {
      toast.success('QuickBooks connected (scaffold)');
      loadStatus();
      window.history.replaceState({}, document.title, '/settings?tab=integrations');
    }
  }, [loadStatus]);

  const connect = async () => {
    setIsConnecting(true);
    try {
      const response = (await apiClient.connectQuickBooks()) as any;
      if (response.success && response.data?.url) {
        window.location.href = response.data.url;
      } else {
        toast.error('Failed to get QuickBooks authorisation URL');
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.error?.message || 'Failed to start QuickBooks connection'
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      const response = (await apiClient.disconnectQuickBooks()) as any;
      if (response.success) {
        toast.success('QuickBooks disconnected');
        setStatus({ connected: false, configured: status?.configured ?? false });
      }
    } catch {
      toast.error('Failed to disconnect QuickBooks');
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border bg-green-50 border-green-200 text-green-900 dark:bg-green-950/40 dark:border-green-800 dark:text-green-100">
        <div className="flex items-center justify-center h-16">
          <ArrowPathIcon className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  const serverConfigured = status?.configured ?? false;

  return (
    <div className="p-4 rounded-lg border bg-green-50 border-green-200 text-green-900 dark:bg-green-950/40 dark:border-green-800 dark:text-green-100">
      <div className="flex items-start space-x-4">
        <div className="w-10 h-10 rounded bg-white flex items-center justify-center text-green-700 font-bold text-sm">
          QB
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-slate-900 dark:text-white">QuickBooks Online</h4>
          <p className="mt-1 text-sm opacity-80">
            OAuth scaffold — client sync and proposal push parity with Xero (W4.7).
          </p>

          {!serverConfigured && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              Server credentials not configured. Set QUICKBOOKS_CLIENT_ID,
              QUICKBOOKS_CLIENT_SECRET, and QUICKBOOKS_REDIRECT_URI on the API.
            </p>
          )}

          {status?.connected ? (
            <>
              <div className="mt-2 flex items-center text-sm">
                <CheckCircleIcon className="h-4 w-4 mr-1 text-green-600" />
                <span className="text-green-700 dark:text-green-400">Connected (scaffold)</span>
                {status.companyName && (
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    ({status.companyName})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={disconnect}
                className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={isConnecting || !serverConfigured}
              className="mt-3 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  Connect QuickBooks
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 ml-2" />
                </>
              )}
            </button>
          )}

          {status?.note && (
            <p className="mt-3 text-xs opacity-70">{status.note}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickBooksConnect;