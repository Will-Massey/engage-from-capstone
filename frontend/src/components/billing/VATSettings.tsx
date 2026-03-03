import { useState, useEffect } from 'react';
import { apiClient } from '../../utils/api';
import toast from 'react-hot-toast';

interface VATSettingsData {
  vatRegistered: boolean;
  vatNumber: string;
  defaultVatRate: 'STANDARD_20' | 'REDUCED_5' | 'ZERO' | 'EXEMPT';
  autoApplyVat: boolean;
}

const vatRateOptions = [
  { value: 'STANDARD_20', label: 'Standard Rate (20%)', rate: 20 },
  { value: 'REDUCED_5', label: 'Reduced Rate (5%)', rate: 5 },
  { value: 'ZERO', label: 'Zero Rated (0%)', rate: 0 },
  { value: 'EXEMPT', label: 'VAT Exempt', rate: 0 },
];

const VATSettings = () => {
  const [settings, setSettings] = useState<VATSettingsData>({
    vatRegistered: true,
    vatNumber: '',
    defaultVatRate: 'STANDARD_20',
    autoApplyVat: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await apiClient.get('/tenants/settings') as any;
      if (response.success) {
        const vatSettings = response.data.vat || {};
        setSettings({
          vatRegistered: vatSettings.vatRegistered ?? true,
          vatNumber: vatSettings.vatNumber || '',
          defaultVatRate: vatSettings.defaultVatRate || 'STANDARD_20',
          autoApplyVat: vatSettings.autoApplyVat ?? true,
        });
      }
    } catch (error) {
      toast.error('Failed to load VAT settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await apiClient.put('/tenants/settings', {
        vat: settings,
      }) as any;
      
      if (response.success) {
        toast.success('VAT settings saved successfully');
      }
    } catch (error) {
      toast.error('Failed to save VAT settings');
    } finally {
      setIsSaving(false);
    }
  };

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
        <h3 className="text-lg font-medium text-gray-900">VAT Settings</h3>
        <p className="mt-1 text-sm text-gray-500">
          Configure how VAT is applied to your services and proposals
        </p>
      </div>

      <div className="space-y-4">
        {/* VAT Registered Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="text-sm font-medium text-gray-900">VAT Registered</label>
            <p className="text-sm text-gray-500">Enable if your practice is VAT registered</p>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, vatRegistered: !settings.vatRegistered })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.vatRegistered ? 'bg-primary-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.vatRegistered ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* VAT Number */}
        {settings.vatRegistered && (
          <div>
            <label className="block text-sm font-medium text-gray-700">VAT Number</label>
            <input
              type="text"
              value={settings.vatNumber}
              onChange={(e) => setSettings({ ...settings, vatNumber: e.target.value })}
              placeholder="GB123456789"
              className="mt-1 input-field"
            />
            <p className="mt-1 text-xs text-gray-500">Your UK VAT registration number</p>
          </div>
        )}

        {/* Default VAT Rate */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Default VAT Rate</label>
          <select
            value={settings.defaultVatRate}
            onChange={(e) => setSettings({ ...settings, defaultVatRate: e.target.value as any })}
            className="mt-1 input-field"
          >
            {vatRateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            This will be applied to new services by default
          </p>
        </div>

        {/* Auto Apply VAT */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <label className="text-sm font-medium text-gray-900">Auto-Apply VAT</label>
            <p className="text-sm text-gray-500">
              Automatically apply VAT to new services and proposals
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, autoApplyVat: !settings.autoApplyVat })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.autoApplyVat ? 'bg-primary-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.autoApplyVat ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary"
        >
          {isSaving ? 'Saving...' : 'Save VAT Settings'}
        </button>
      </div>
    </div>
  );
};

export default VATSettings;
