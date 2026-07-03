import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  CloudArrowDownIcon,
} from '@heroicons/react/24/outline';

interface XeroStatus {
  connected: boolean;
  configured: boolean;
  xeroTenantId?: string;
  xeroTenantName?: string;
  connectedAt?: string;
  lastImportAt?: string;
  lastPushAt?: string;
  scopes?: string[];
}

const XeroConnect = () => {
  const [status, setStatus] = useState<XeroStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const response = (await apiClient.getXeroStatus()) as any;
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

    if (error) {
      toast.error(`Xero connection failed: ${error}`);
      window.history.replaceState({}, document.title, '/settings?tab=integrations');
      return;
    }

    if (oauth === 'success' && provider === 'xero') {
      toast.success('Xero connected successfully!');
      loadStatus();
      window.history.replaceState({}, document.title, '/settings?tab=integrations');
    }
  }, [loadStatus]);

  const connect = async () => {
    setIsConnecting(true);
    try {
      const response = (await apiClient.connectXero()) as any;
      if (response.success && response.data?.url) {
        window.location.href = response.data.url;
      } else {
        toast.error('Failed to get Xero authorization URL');
      }
    } catch (error: any) {
      toast.error(
        error.response?.data?.error?.message || 'Failed to start Xero connection'
      );
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      const response = (await apiClient.disconnectXero()) as any;
      if (response.success) {
        toast.success('Xero disconnected');
        setStatus({ connected: false, configured: status?.configured ?? false });
      }
    } catch {
      toast.error('Failed to disconnect Xero');
    }
  };

  const importClients = async () => {
    setIsImporting(true);
    try {
      const response = (await apiClient.importXeroClients()) as any;
      if (response.success) {
        toast.success(response.message || `Imported ${response.data?.created ?? 0} clients`);
        loadStatus();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Client import failed');
    } finally {
      setIsImporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-100">
        <div className="flex items-center justify-center h-16">
          <ArrowPathIcon className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  const serverConfigured = status?.configured ?? false;

  return (
    <div className="p-4 rounded-lg border bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-100">
      <div className="flex items-start space-x-4">
        <img
          src="https://www.xero.com/favicon.ico"
          alt="Xero"
          className="w-10 h-10 rounded bg-white p-1"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="flex-1">
          <h4 className="font-medium text-slate-900 dark:text-white">Xero Accounting</h4>
          <p className="mt-1 text-sm opacity-80">
            Import clients from Xero and push accepted proposal fees as contact notes.
          </p>

          {!serverConfigured && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              Server Xero credentials are not configured. Set XERO_CLIENT_ID and
              XERO_CLIENT_SECRET on the API.
            </p>
          )}

          {status?.connected ? (
            <>
              <div className="mt-2 flex items-center text-sm">
                <CheckCircleIcon className="h-4 w-4 mr-1 text-green-600" />
                <span className="text-green-700 dark:text-green-400">Connected</span>
                {status.xeroTenantName && (
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    ({status.xeroTenantName})
                  </span>
                )}
              </div>
              {status.lastImportAt && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Last import: {new Date(status.lastImportAt).toLocaleString()}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={importClients}
                  disabled={isImporting}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50"
                >
                  {isImporting ? (
                    <ArrowPathIcon className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CloudArrowDownIcon className="h-4 w-4 mr-1" />
                  )}
                  Import clients from Xero
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  className="text-sm text-red-600 hover:text-red-800 underline"
                >
                  Disconnect
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={connect}
              disabled={isConnecting || !serverConfigured}
              className="mt-3 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isConnecting ? (
                <>
                  <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect Xero
                  <ArrowTopRightOnSquareIcon className="h-4 w-4 ml-2" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {!status?.connected && serverConfigured && (
        <div className="mt-4 pt-4 border-t border-sky-200 dark:border-sky-800">
          <p className="text-xs opacity-70">
            <strong>What happens next?</strong>
            <br />
            You&apos;ll authorize Engage to read contacts and write contact notes in your Xero
            organisation. Accepted proposals can be pushed via API (
            <code className="text-xs">POST /api/xero/push-accepted/:proposalId</code>).
          </p>
        </div>
      )}
    </div>
  );
};

export default XeroConnect;