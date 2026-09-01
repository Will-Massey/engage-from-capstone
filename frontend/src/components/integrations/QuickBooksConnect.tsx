import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  CloudArrowDownIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';
import { isApprover } from '../../constants/roles';
import { buildQuickBooksSettingsPayload } from '../../utils/accountingSync';

interface QuickBooksStatus {
  connected: boolean;
  configured: boolean;
  realmId?: string;
  companyName?: string;
  connectedAt?: string;
  lastImportAt?: string;
  lastPushAt?: string;
  paymentAccountId?: string;
}

const QuickBooksConnect = () => {
  // Connect/disconnect/import are all authorize('ADMIN','PARTNER','MANAGER')
  // on the backend (quickbooks.ts) — mirror it here so a SENIOR sees the
  // read-only status instead of buttons that 403.
  const canManage = isApprover(useAuthStore((s) => s.user?.role));
  const [status, setStatus] = useState<QuickBooksStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const response = (await apiClient.getQuickBooksStatus()) as any;
      if (response.success) {
        setStatus(response.data);
        setPaymentAccountId(response.data?.paymentAccountId ?? '');
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
      window.history.replaceState({}, document.title, '/integrations');
      return;
    }

    if (oauth === 'success' && provider === 'quickbooks') {
      toast.success('QuickBooks connected successfully!');
      loadStatus();
      window.history.replaceState({}, document.title, '/integrations');
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
      toast.error(error.response?.data?.error?.message || 'Failed to start QuickBooks connection');
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

  const saveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const response = (await apiClient.updateQuickBooksSettings(
        buildQuickBooksSettingsPayload({ paymentAccountId })
      )) as any;
      if (response.success) {
        toast.success('QuickBooks sync settings saved');
        setStatus((prev) => ({
          ...(prev ?? { connected: true, configured: true }),
          ...response.data,
        }));
        setPaymentAccountId(response.data?.paymentAccountId ?? paymentAccountId);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to save QuickBooks settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const importClients = async () => {
    setIsImporting(true);
    try {
      const response = (await apiClient.importQuickBooksClients()) as any;
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
            Import customers from QuickBooks and mirror each recurring payment Stripe collects as a
            QuickBooks invoice.
          </p>

          {!serverConfigured && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
              Server credentials not configured. Set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET,
              and QUICKBOOKS_REDIRECT_URI on the API.
            </p>
          )}

          {status?.connected ? (
            <>
              <div className="mt-2 flex items-center text-sm">
                <CheckCircleIcon className="h-4 w-4 mr-1 text-green-600" />
                <span className="text-green-700 dark:text-green-400">Connected</span>
                {status.companyName && (
                  <span className="ml-2 text-slate-500 dark:text-slate-400">
                    ({status.companyName})
                  </span>
                )}
              </div>
              {status.lastImportAt && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Last import: {new Date(status.lastImportAt).toLocaleString()}
                </p>
              )}
              {canManage ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={importClients}
                      disabled={isImporting}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg disabled:opacity-50"
                    >
                      {isImporting ? (
                        <ArrowPathIcon className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <CloudArrowDownIcon className="h-4 w-4 mr-1" />
                      )}
                      Import clients from QuickBooks
                    </button>
                    <button
                      type="button"
                      onClick={disconnect}
                      className="text-sm text-red-600 hover:text-red-800 underline"
                    >
                      Disconnect
                    </button>
                  </div>
                  <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800 space-y-3">
                    <h5 className="text-sm font-medium text-slate-900 dark:text-white">
                      Payment account
                    </h5>
                    <label className="block text-sm">
                      Deposit account ID (optional)
                      <input
                        type="text"
                        value={paymentAccountId}
                        onChange={(e) => setPaymentAccountId(e.target.value)}
                        placeholder="e.g. 35"
                        className="mt-1 block w-40 rounded border border-green-300 dark:border-green-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                      />
                      <span className="block mt-1 text-xs opacity-70">
                        When set, Stripe collections are marked paid against this QuickBooks bank
                        account. Leave blank to leave invoices awaiting payment.
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={saveSettings}
                      disabled={isSavingSettings}
                      className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-green-700 hover:bg-green-800 rounded-lg disabled:opacity-50"
                    >
                      {isSavingSettings && <ArrowPathIcon className="h-4 w-4 mr-1 animate-spin" />}
                      Save sync settings
                    </button>
                  </div>
                  <p className="mt-3 text-xs opacity-70">
                    Recurring payments collected by Stripe are mirrored automatically as QuickBooks
                    invoices, so your books always match the money actually collected. TaxCalc is
                    not connected — Engage stays independent of it.
                  </p>
                </>
              ) : (
                <p className="mt-3 text-xs opacity-70">
                  Ask an admin, partner, or manager to manage this connection.
                </p>
              )}
            </>
          ) : canManage ? (
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
          ) : (
            <p className="mt-3 text-xs opacity-70">
              Ask an admin, partner, or manager to connect QuickBooks.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickBooksConnect;
