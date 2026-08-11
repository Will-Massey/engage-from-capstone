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
 * A mailbox OAuth callback landing on this page names its provider in the URL
 * (?oauth=success&provider=gmail, or an error with the same shape) — read it
 * synchronously so the picker (and the OAuthConnect it mounts) is on the right
 * provider from the first render, not only once GET /email/config resolves.
 * Without this, a failed config fetch left the picker on the Microsoft 365
 * default forever: OAuthConnect's callback effect never saw a matching
 * provider prop, so the success/error toast never fired and the oauth params
 * were never cleared from the URL.
 */
const providerFromCallbackUrl = (): MailboxProvider | null => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('oauth') !== 'success' && !params.get('error')) return null;
  return toMailboxProvider(params.get('provider'));
};

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
  const callbackProvider = providerFromCallbackUrl();
  const [provider, setProvider] = useState<MailboxProvider>(callbackProvider || 'microsoft365');
  // A provider named in the callback URL is as good as a user pick — it's the
  // mailbox they just finished connecting (or tried to), so the async fetch
  // below must not override it.
  const userPicked = useRef(!!callbackProvider);
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
