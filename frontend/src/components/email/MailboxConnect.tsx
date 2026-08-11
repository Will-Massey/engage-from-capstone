import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '../../utils/api';
import OAuthConnect from './OAuthConnect';
import { toMailboxProvider, type MailboxProvider } from './emailProvider';

const MAILBOX_PROVIDERS: {
  value: MailboxProvider;
  label: string;
  description: string;
}[] = [
  { value: 'microsoft365', label: 'Microsoft 365', description: 'Business Microsoft accounts' },
  { value: 'gmail', label: 'Google / Gmail', description: 'Gmail and Google Workspace' },
  { value: 'outlook', label: 'Outlook.com', description: 'Personal Microsoft accounts' },
];

/**
 * Provider picker + OAuth connect widget for the practice mailbox (Microsoft 365,
 * Google, or Outlook.com). Shared between Settings > Email and the Integrations hub
 * so there is a single place that owns the connect/disconnect flow.
 *
 * The picker starts on whatever provider the practice is actually connected to —
 * defaulting to Microsoft 365 for a Gmail practice showed "Not connected" and
 * invited them to rebind the wrong mailbox.
 */
const MailboxConnect = () => {
  const [provider, setProvider] = useState<MailboxProvider>('microsoft365');
  const userPicked = useRef(false);
  const label = MAILBOX_PROVIDERS.find((p) => p.value === provider)?.label || provider;

  // Mount-only: seeds the initial selection from the connected mailbox, it does
  // not track it afterwards.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/email/config')
      .then((response: any) => {
        if (cancelled || !response?.success) return;
        const connected = toMailboxProvider(response.data?.provider);
        // Don't yank the picker out from under someone who already chose.
        if (connected && !userPicked.current) setProvider(connected);
      })
      .catch(() => {
        // Picker just stays on the default if we can't tell.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {MAILBOX_PROVIDERS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              userPicked.current = true;
              setProvider(p.value);
            }}
            className={`p-3 rounded-lg border-2 text-left transition-colors ${
              provider === p.value
                ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'
            }`}
          >
            <span className="font-medium text-gray-900 dark:text-gray-100">{p.label}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400">{p.description}</p>
          </button>
        ))}
      </div>

      <OAuthConnect provider={provider} onConnected={() => toast.success(`${label} connected`)} />
    </div>
  );
};

export default MailboxConnect;
