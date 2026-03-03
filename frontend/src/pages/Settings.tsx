import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  UserCircleIcon,
  BuildingOfficeIcon,
  BellIcon,
  ShieldCheckIcon,
  EnvelopeIcon,
  CalculatorIcon,
} from '@heroicons/react/24/outline';
import VATSettings from '../components/billing/VATSettings';
import EmailSettings from '../components/email/EmailSettings';

const tabs = [
  { id: 'profile', name: 'Profile', icon: UserCircleIcon },
  { id: 'company', name: 'Company', icon: BuildingOfficeIcon },
  { id: 'vat', name: 'VAT Settings', icon: CalculatorIcon },
  { id: 'email', name: 'Email', icon: EnvelopeIcon },
  { id: 'notifications', name: 'Notifications', icon: BellIcon },
  { id: 'security', name: 'Security', icon: ShieldCheckIcon },
];

const Settings = () => {
  const { user, tenant } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account and practice settings
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar tabs */}
        <div className="lg:w-64 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <tab.icon
                  className={`mr-3 h-5 w-5 ${
                    activeTab === tab.id ? 'text-primary-500' : 'text-gray-400'
                  }`}
                />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'profile' && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Settings</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">First Name</label>
                    <input
                      type="text"
                      defaultValue={user?.firstName}
                      className="mt-1 input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Name</label>
                    <input
                      type="text"
                      defaultValue={user?.lastName}
                      className="mt-1 input-field"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    defaultValue={user?.email}
                    className="mt-1 input-field"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <input
                    type="text"
                    defaultValue={user?.role}
                    className="mt-1 input-field"
                    disabled
                  />
                </div>
                <div className="pt-4">
                  <button className="btn-primary">Save Changes</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'company' && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Company Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Practice Name</label>
                  <input
                    type="text"
                    defaultValue={tenant?.name}
                    className="mt-1 input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Primary Color</label>
                  <div className="mt-1 flex items-center space-x-3">
                    <input
                      type="color"
                      defaultValue={tenant?.primaryColor || '#0ea5e9'}
                      className="h-10 w-20 rounded border border-gray-300"
                    />
                    <span className="text-sm text-gray-500">
                      {tenant?.primaryColor || '#0ea5e9'}
                    </span>
                  </div>
                </div>
                <div className="pt-4">
                  <button className="btn-primary">Save Changes</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h2>
              <div className="space-y-4">
                {[
                  'Email me when a proposal is accepted',
                  'Email me when a proposal is viewed',
                  'Email me about upcoming MTD ITSA deadlines',
                  'Send weekly summary report',
                ].map((label, index) => (
                  <div key={index} className="flex items-center">
                    <input
                      type="checkbox"
                      defaultChecked={index < 2}
                      className="h-4 w-4 text-primary-600 border-gray-300 rounded"
                    />
                    <label className="ml-3 text-sm text-gray-700">{label}</label>
                  </div>
                ))}
                <div className="pt-4">
                  <button className="btn-primary">Save Preferences</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'vat' && (
            <div className="card p-6">
              <VATSettings />
            </div>
          )}

          {activeTab === 'email' && (
            <div className="card p-6">
              <EmailSettings />
            </div>
          )}

          {activeTab === 'security' && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Security Settings</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Change Password</h3>
                  <div className="mt-3 space-y-3">
                    <input
                      type="password"
                      placeholder="Current password"
                      className="input-field"
                    />
                    <input
                      type="password"
                      placeholder="New password"
                      className="input-field"
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      className="input-field"
                    />
                  </div>
                  <button className="mt-3 btn-primary">Update Password</button>
                </div>

                <div className="border-t border-gray-200 pt-6">
                  <h3 className="text-sm font-medium text-gray-900">Two-Factor Authentication</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Add an extra layer of security to your account
                  </p>
                  <button className="mt-3 btn-secondary">Enable 2FA</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
