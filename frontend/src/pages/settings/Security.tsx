/**
 * Security Settings Page
 * Manage password, 2FA, and account security
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { apiClient } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import toast from 'react-hot-toast';
import {
  ShieldCheckIcon,
  KeyIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';

export const SecuritySettings: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // 2FA state
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);
  const [disable2FAPassword, setDisable2FAPassword] = useState('');
  const [showDisable2FAConfirm, setShowDisable2FAConfirm] = useState(false);

  // Account deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (newPassword.length < 12) {
      toast.error('Password must be at least 12 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      await apiClient.put('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDisable2FA = async () => {
    setIsDisabling2FA(true);
    try {
      await apiClient.post('/auth/2fa/disable', { password: disable2FAPassword });
      toast.success('Two-factor authentication disabled');
      setShowDisable2FAConfirm(false);
      setDisable2FAPassword('');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to disable 2FA');
    } finally {
      setIsDisabling2FA(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      await apiClient.delete('/auth/me', {
        data: { password: deletePassword, confirmDelete: true },
      });
      toast.success('Account deleted successfully');
      logout();
      navigate('/');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to delete account');
      setIsDeleting(false);
    }
  };

  const handleExportData = async () => {
    try {
      const response = await apiClient.get('/auth/me/export');
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Data export downloaded');
    } catch (error: any) {
      toast.error('Failed to export data');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Security Settings</h1>
        <p className="text-slate-600">Manage your account security and authentication methods.</p>
      </div>

      {/* Two-Factor Authentication */}
      <Card>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              user?.twoFactorEnabled ? 'bg-green-100' : 'bg-slate-100'
            }`}>
              <ShieldCheckIcon className={`w-6 h-6 ${
                user?.twoFactorEnabled ? 'text-green-600' : 'text-slate-500'
              }`} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Two-Factor Authentication</h3>
              <p className="text-sm text-slate-600 mt-1">
                {user?.twoFactorEnabled 
                  ? 'Your account is protected with 2FA.' 
                  : 'Add an extra layer of security to your account.'}
              </p>
            </div>
          </div>
          
          {user?.twoFactorEnabled ? (
            <Button
              variant="secondary"
              onClick={() => setShowDisable2FAConfirm(true)}
            >
              Disable
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/2fa-setup')}
            >
              Enable
              <ArrowRightIcon className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>

        {user?.twoFactorEnabled && (
          <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
            <CheckCircleIcon className="w-4 h-4" />
            <span>2FA is enabled</span>
          </div>
        )}
      </Card>

      {/* Change Password */}
      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <KeyIcon className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Change Password</h3>
            <p className="text-sm text-slate-600">Update your password regularly for better security.</p>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label="Current Password"
            type={showPasswords ? 'text' : 'password'}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            leftIcon={LockClosedIcon}
            rightIcon={showPasswords ? EyeIcon : EyeSlashIcon}
            onRightIconClick={() => setShowPasswords(!showPasswords)}
          />
          
          <Input
            label="New Password"
            type={showPasswords ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            leftIcon={LockClosedIcon}
          />
          
          <Input
            label="Confirm New Password"
            type={showPasswords ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            leftIcon={LockClosedIcon}
            error={confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : undefined}
          />

          <Button
            onClick={handleChangePassword}
            isLoading={isChangingPassword}
            disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
          >
            Change Password
          </Button>
        </div>
      </Card>

      {/* Data & Privacy */}
      <Card>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
            <ShieldCheckIcon className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Data & Privacy</h3>
            <p className="text-sm text-slate-600">Manage your personal data.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-slate-100">
            <div>
              <p className="font-medium text-slate-900">Export Your Data</p>
              <p className="text-sm text-slate-600">Download a copy of all your data.</p>
            </div>
            <Button variant="secondary" onClick={handleExportData}>
              Export
            </Button>
          </div>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-900">Danger Zone</h3>
            <p className="text-sm text-red-600">Irreversible and destructive actions.</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-900">Delete Account</p>
            <p className="text-sm text-slate-600">Permanently delete your account and all data.</p>
          </div>
          <Button
            variant="danger"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <TrashIcon className="w-4 h-4 mr-2" />
            Delete Account
          </Button>
        </div>
      </Card>

      {/* Disable 2FA Modal */}
      {showDisable2FAConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold">Disable Two-Factor Auth?</h3>
            </div>
            <p className="text-slate-600 mb-4">
              This will remove the extra security layer from your account. We recommend keeping 2FA enabled.
            </p>
            <Input
              label="Enter your password to confirm"
              type="password"
              value={disable2FAPassword}
              onChange={(e) => setDisable2FAPassword(e.target.value)}
              className="mb-4"
            />
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowDisable2FAConfirm(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDisable2FA}
                isLoading={isDisabling2FA}
                disabled={!disable2FAPassword}
                className="flex-1"
              >
                Disable 2FA
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <TrashIcon className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-red-900">Delete Account?</h3>
            </div>
            <p className="text-slate-600 mb-4">
              This action cannot be undone. Your account will be permanently anonymized according to GDPR requirements.
            </p>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm text-red-800">
                  I understand that this will permanently delete my account and I will lose access to all data.
                </span>
              </label>
            </div>

            <Input
              label="Enter your password to confirm"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="mb-4"
            />

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteAccount}
                isLoading={isDeleting}
                disabled={!deleteConfirm || !deletePassword}
                className="flex-1"
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecuritySettings;
