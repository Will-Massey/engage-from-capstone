import { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';
import { LinkIcon } from '@heroicons/react/24/outline';

export default function WebhookSettings() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookFormat, setWebhookFormat] = useState<'default' | 'hubspot'>('default');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = (await apiClient.getTenantSettings()) as any;
        const url = res?.data?.webhookUrl || res?.data?.integrations?.webhookUrl || '';
        setWebhookUrl(url);
        const fmt = res?.data?.integrations?.webhookFormat;
        if (fmt === 'hubspot') setWebhookFormat('hubspot');
      } catch {
        // non-blocking
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = (await apiClient.updateTenantSettings({
        integrations: {
          webhookUrl: webhookUrl.trim() || '',
          webhookFormat,
        },
        webhookUrl: webhookUrl.trim() || '',
      })) as any;
      if (res.success) {
        toast.success('Webhook URL saved');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save webhook URL');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <LinkIcon className="h-6 w-6 text-violet-600 shrink-0 mt-1" />
        <div className="flex-1">
          <h4 className="font-medium text-slate-900 dark:text-white">Proposal event webhook</h4>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Zapier, Make, or HubSpot workflows can receive{' '}
            <code className="text-xs">proposal.sent</code>,{' '}
            <code className="text-xs">proposal.accepted</code>, and{' '}
            <code className="text-xs">proposal.declined</code> events. Append{' '}
            <code className="text-xs">?format=hubspot</code> on the server test call for HubSpot-shaped
            payloads.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="webhook-url" className="block text-sm font-medium text-slate-800 dark:text-slate-200">
          HTTPS webhook URL
        </label>
        <input
          id="webhook-url"
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.zapier.com/hooks/catch/…"
          className="input-field w-full mt-1"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 mb-1">
          Payload format
        </label>
        <select
          value={webhookFormat}
          onChange={(e) => setWebhookFormat(e.target.value as 'default' | 'hubspot')}
          className="input-field w-full max-w-xs"
        >
          <option value="default">Engage default (Zapier / Make)</option>
          <option value="hubspot">HubSpot-shaped events</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : 'Save webhook URL'}
        </button>
        <button
          type="button"
          disabled={testing || !webhookUrl.trim()}
          className="btn-secondary"
          onClick={async () => {
            setTesting(true);
            try {
              const res = (await apiClient.testIntegrationWebhook(webhookFormat)) as any;
              if (res.success) {
                toast.success('Test event sent to your webhook');
              }
            } catch (e: any) {
              toast.error(e?.message || 'Test webhook failed — save a URL first');
            } finally {
              setTesting(false);
            }
          }}
        >
          {testing ? 'Sending…' : 'Send test event'}
        </button>
      </div>
    </div>
  );
}