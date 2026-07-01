import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { apiClient } from '../utils/api';
import toast from 'react-hot-toast';
import {
  UserCircleIcon,
  BuildingOfficeIcon,
  EnvelopeIcon,
  CalculatorIcon,
  UsersIcon,
  ShieldCheckIcon,
  PaintBrushIcon,
  DocumentTextIcon,
  BellIcon,
  SparklesIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  PuzzlePieceIcon,
} from '@heroicons/react/24/outline';
import EmailSettings from '../components/email/EmailSettings';
import CoverLetterTemplatesManager from '../components/settings/CoverLetterTemplatesManager';
import XeroConnect from '../components/integrations/XeroConnect';
import QuickBooksConnect from '../components/integrations/QuickBooksConnect';
import WebhookSettings from '../components/settings/WebhookSettings';
import FirmGroupSettings from '../components/settings/FirmGroupSettings';
import VoiceOfPracticeSettings from '../components/settings/VoiceOfPracticeSettings';
import EngagementLibrarySettings from '../components/settings/EngagementLibrarySettings';

// Simplified tabs - combined related sections
const tabs = [
  { id: 'profile', name: 'My Profile', icon: UserCircleIcon, description: 'Personal information' },
  {
    id: 'practice',
    name: 'Practice',
    icon: BuildingOfficeIcon,
    description: 'Company & legal details',
  },
  { id: 'branding', name: 'Branding', icon: PaintBrushIcon, description: 'Logo & colors' },
  { id: 'appearance', name: 'Appearance', icon: SunIcon, description: 'Light / dark theme' },
  {
    id: 'communications',
    name: 'Communications',
    icon: EnvelopeIcon,
    description: 'Email & templates',
  },
  {
    id: 'billing',
    name: 'Billing & VAT',
    icon: CalculatorIcon,
    description: 'Tax & payment settings',
  },
  { id: 'team', name: 'Team', icon: UsersIcon, description: 'Users & permissions' },
  { id: 'security', name: 'Security', icon: ShieldCheckIcon, description: 'Password & access' },
  { id: 'automation', name: 'Automation', icon: BellIcon, description: 'Client touchpoints & onboarding workflow' },
  {
    id: 'integrations',
    name: 'Integrations',
    icon: PuzzlePieceIcon,
    description: 'Xero, payments & connected apps',
  },
  {
    id: 'firm-group',
    name: 'Firm group',
    icon: BuildingOfficeIcon,
    description: 'Multi-firm workspace admin',
  },
];

const VALID_TABS = tabs.map((t) => t.id);

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const { user, tenant, setSession, updateUser } = useAuthStore();
  const { theme: currentTheme, setTheme: setCurrentTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState(() =>
    tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'profile'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState<string | null>(null);

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    jobTitle: user?.jobTitle || '',
  });

  // Combined Practice & Legal form state
  const [practiceForm, setPracticeForm] = useState({
    name: tenant?.name || '',
    companyRegistration: '',
    professionalBody: 'ACCA',
    firmReference: '',
    address: '',
    phone: '',
    website: '',
    // Legal fields
    insurerName: '',
    governingLaw: 'England and Wales',
    fcaAuthorised: false,
    privacyPolicyUrl: '',
  });

  // Branding form state
  const [brandingForm, setBrandingForm] = useState({
    primaryColor: tenant?.primaryColor || '#0ea5e9',
    logo: tenant?.logo || '',
  });

  // Communications form state
  const [communicationsForm, setCommunicationsForm] = useState({
    defaultCoverTemplate: '',
    proposalFooter: '',
    proposals: {
      defaultExpiryDays: 30,
      renewalReminderDays: 30,
      defaultPaymentTermsDays: 7,
    },
    notifications: {
      proposalAccepted: true,
      proposalViewed: true,
      mtditsaDeadlines: true,
      weeklySummary: false,
    },
  });

  // Password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [disable2FAPassword, setDisable2FAPassword] = useState('');
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);

  // Team/Users state
  const [users, setUsers] = useState<any[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    jobTitle: '',
    role: 'JUNIOR',
    password: '',
  });
  const [editUserForm, setEditUserForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    jobTitle: '',
    role: 'JUNIOR',
  });

  const formatTeamRole = (role: string) =>
    role
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  const [vatForm, setVatForm] = useState({
    vatRegistered: true,
    vatNumber: '',
    defaultVatRate: 'STANDARD_20' as 'ZERO' | 'REDUCED_5' | 'STANDARD_20' | 'EXEMPT',
    autoApplyVat: true,
  });

  const [paymentForm, setPaymentForm] = useState({
    collectPaymentAtSign: false,
    allowDirectDebit: true,
    allowCard: true,
  });

  // Clara & AI budget (fetched for visibility meter)
  const [aiBudget, setAiBudget] = useState<any>(null);
  const [aiBudgetLoading, setAiBudgetLoading] = useState(true);
  const [aiBudgetError, setAiBudgetError] = useState<string | null>(null);

  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl, activeTab]);

  const selectTab = (id: string) => {
    setActiveTab(id);
    setSearchParams(id === 'profile' ? {} : { tab: id }, { replace: true });
  };
  useEffect(() => {
    if (activeTab === 'team') {
      loadUsers();
    }
  }, [activeTab]);

  // Load Clara AI budget status (cheap, always; used in Appearance + Automation)
  useEffect(() => {
    const loadAiBudget = async () => {
      setAiBudgetLoading(true);
      setAiBudgetError(null);
      try {
        const res = (await apiClient.aiStatus()) as any;
        const budget = res?.data?.tokenBudget || res?.tokenBudget;
        if (budget) {
          setAiBudget(budget);
        } else {
          setAiBudgetError('No budget data');
        }
      } catch (e: any) {
        setAiBudgetError(e?.message || 'Failed to load AI status');
      } finally {
        setAiBudgetLoading(false);
      }
    };
    loadAiBudget();
  }, []);

  // Load tenant settings on mount
  useEffect(() => {
    loadTenantSettings();
  }, []);

  // Sync profile form (phone/jobTitle) from the auth user (populated by /auth/me)
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form (phone, jobTitle) when user data loads from /auth/me
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form (phone/jobTitle) from auth user loaded via /auth/me
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form (phone/jobTitle now returned from /auth/me)
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form (phone, jobTitle) when user data is loaded from /auth/me
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form with user data loaded from server (/auth/me now includes phone/jobTitle)
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form with user data from server (phone and jobTitle are now returned by /auth/me)
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form (phone, jobTitle) from the auth user loaded via /auth/me
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form fields from auth user (phone/jobTitle now returned by /me)
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form (phone, jobTitle etc) when auth user loads or updates
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form with full user data (phone, jobTitle) once loaded from /me
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form fields (including phone/jobTitle) when user data is available/updated
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  // Sync profile form when user data loads/refreshes (e.g. after bootstrap)
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        firstName: user.firstName || prev.firstName,
        lastName: user.lastName || prev.lastName,
        email: user.email || prev.email,
        phone: user.phone || prev.phone,
        jobTitle: user.jobTitle || prev.jobTitle,
      }));
    }
  }, [user]);

  const loadTenantSettings = async () => {
    try {
      const response = (await apiClient.getTenantSettings()) as any;
      if (response.success && response.data) {
        const data = response.data;
        setPracticeForm((prev) => ({
          ...prev,
          name: data.branding?.name || prev.name,
          professionalBody: data.professionalBody || 'ACCA',
          companyRegistration: data.companyRegistration || '',
          address: data.address?.line1
            ? `${data.address.line1}\n${data.address.line2 || ''}\n${data.address.city}\n${data.address.postcode}`
            : '',
          phone: data.phone || '',
          website: data.website || '',
          insurerName: data.insurerName || '',
          governingLaw: data.governingLaw || 'England and Wales',
          fcaAuthorised: data.fcaAuthorised || false,
          privacyPolicyUrl: data.privacyPolicyUrl || '',
        }));
        setBrandingForm((prev) => ({
          ...prev,
          primaryColor: data.branding?.primaryColor || prev.primaryColor,
          logo: data.branding?.logo || prev.logo,
        }));
        if (data.notifications) {
          setCommunicationsForm((prev) => ({
            ...prev,
            notifications: { ...prev.notifications, ...data.notifications },
          }));
        }
        if (data.proposals) {
          setCommunicationsForm((prev) => ({
            ...prev,
            proposals: { ...prev.proposals, ...data.proposals },
          }));
        }
        if (data.vat) {
          setVatForm((prev) => ({
            ...prev,
            vatRegistered: data.vat.vatRegistered ?? prev.vatRegistered,
            vatNumber: data.vat.vatNumber || '',
            defaultVatRate: data.vat.defaultVatRate || prev.defaultVatRate,
            autoApplyVat: data.vat.autoApplyVat ?? prev.autoApplyVat,
          }));
        }
        if (data.payments) {
          setPaymentForm((prev) => ({
            ...prev,
            collectPaymentAtSign: data.payments.collectPaymentAtSign ?? prev.collectPaymentAtSign,
            allowDirectDebit: data.payments.allowDirectDebit ?? prev.allowDirectDebit,
            allowCard: data.payments.allowCard ?? prev.allowCard,
          }));
        }
      }
    } catch (error) {
      // Error handled by UI
    }
  };

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      const response = (await apiClient.getUsers()) as any;
      if (response.success) {
        setUsers(response.data || []);
      }
    } catch (error) {
      toast.error('Failed to load team members');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCommunications = async () => {
    setIsSaving('communications');
    try {
      const response = (await apiClient.updateTenantSettings({
        notifications: communicationsForm.notifications,
        proposals: communicationsForm.proposals,
      })) as any;
      if (response.success) {
        toast.success('Communication settings saved');
      } else {
        toast.error(response.error?.message || 'Failed to save settings');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setIsSaving(null);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving('profile');
    try {
      const response = (await apiClient.updateMe({
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        email: profileForm.email,
        phone: profileForm.phone,
        jobTitle: profileForm.jobTitle,
      })) as any;

      if (response.success) {
        setSession(response.data.user, tenant!);
        toast.success('Profile saved successfully');
      } else {
        toast.error(response.error?.message || 'Failed to save profile');
      }
    } catch (error: any) {
      toast.error(error.message || 'Network error');
    } finally {
      setIsSaving(null);
    }
  };

  const handleSavePractice = async () => {
    setIsSaving('practice');
    try {
      const response = (await apiClient.updateTenantSettings({
        branding: {
          name: practiceForm.name,
          primaryColor: brandingForm.primaryColor,
          logo: brandingForm.logo,
        },
        professionalBody: practiceForm.professionalBody,
        companyRegistration: practiceForm.companyRegistration,
        address: {
          line1: practiceForm.address.split('\n')[0] || '',
          line2: practiceForm.address.split('\n')[1] || '',
          city: practiceForm.address.split('\n')[2] || '',
          postcode: practiceForm.address.split('\n')[3] || '',
          country: 'United Kingdom',
        },
        phone: practiceForm.phone,
        website: practiceForm.website,
        insurerName: practiceForm.insurerName,
        governingLaw: practiceForm.governingLaw,
        fcaAuthorised: practiceForm.fcaAuthorised,
        privacyPolicyUrl: practiceForm.privacyPolicyUrl,
      })) as any;

      if (response.success) {
        if (tenant && response.data?.branding) {
          setSession(user!, {
            ...tenant,
            name: response.data.branding.name || practiceForm.name,
            logo: response.data.branding.logo ?? brandingForm.logo,
            primaryColor: response.data.branding.primaryColor ?? brandingForm.primaryColor,
          });
        }
        toast.success('Practice settings saved successfully');
      } else {
        toast.error(response.error?.message || 'Failed to save settings');
      }
    } catch (error: any) {
      toast.error(error.message || 'Network error');
    } finally {
      setIsSaving(null);
    }
  };

  const handleSaveVat = async () => {
    setIsSaving('billing');
    try {
      const response = (await apiClient.updateTenantSettings({
        vat: {
          vatRegistered: vatForm.vatRegistered,
          vatNumber: vatForm.vatNumber || undefined,
          defaultVatRate: vatForm.defaultVatRate,
          autoApplyVat: vatForm.autoApplyVat,
        },
        payments: paymentForm,
      })) as any;
      if (response.success) {
        toast.success('Billing settings saved');
      } else {
        toast.error(response.error?.message || 'Failed to save billing settings');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save billing settings');
    } finally {
      setIsSaving(null);
    }
  };

  const handleSaveBranding = async () => {
    setIsSaving('branding');
    try {
      const response = (await apiClient.updateTenantSettings({
        branding: {
          primaryColor: brandingForm.primaryColor,
          logo: brandingForm.logo,
        },
      })) as any;

      if (response.success) {
        if (tenant && response.data?.branding) {
          setSession(user!, {
            ...tenant,
            logo: response.data.branding.logo ?? brandingForm.logo,
            primaryColor: response.data.branding.primaryColor ?? brandingForm.primaryColor,
            name: response.data.branding.name || tenant.name,
          });
        }
        toast.success('Branding saved successfully');
      }
    } catch (error) {
      toast.error('Failed to save branding');
    } finally {
      setIsSaving(null);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be less than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setBrandingForm((prev) => ({ ...prev, logo: base64 }));
      toast.success('Logo loaded. Click Save to apply.');
    };
    reader.readAsDataURL(file);
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    // Password complexity validation
    const pwd = passwordForm.newPassword;
    if (pwd.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(pwd)) {
      toast.error('Password must contain at least one uppercase letter');
      return;
    }
    if (!/[a-z]/.test(pwd)) {
      toast.error('Password must contain at least one lowercase letter');
      return;
    }
    if (!/[0-9]/.test(pwd)) {
      toast.error('Password must contain at least one number');
      return;
    }
    if (!/[^A-Za-z0-9]/.test(pwd)) {
      toast.error('Password must contain at least one special character');
      return;
    }

    setIsSaving('security');
    try {
      const response = (await apiClient.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })) as any;

      if (response.success) {
        toast.success('Password changed successfully');
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        toast.error(response.error?.message || 'Failed to change password');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to change password');
    } finally {
      setIsSaving(null);
    }
  };

  const handleDisable2FA = async () => {
    if (!disable2FAPassword) {
      toast.error('Enter your password to disable 2FA');
      return;
    }

    setIsDisabling2FA(true);
    try {
      await apiClient.post('/auth/2fa/disable', { password: disable2FAPassword });
      updateUser({ twoFactorEnabled: false });
      setDisable2FAPassword('');
      toast.success('Two-factor authentication disabled');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to disable 2FA');
    } finally {
      setIsDisabling2FA(false);
    }
  };

  const handleCreateUser = async () => {
    // Validate password complexity
    const pwd = newUserForm.password;
    if (pwd.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(pwd)) {
      toast.error('Password must contain at least one uppercase letter');
      return;
    }
    if (!/[a-z]/.test(pwd)) {
      toast.error('Password must contain at least one lowercase letter');
      return;
    }
    if (!/[0-9]/.test(pwd)) {
      toast.error('Password must contain at least one number');
      return;
    }
    if (!/[^A-Za-z0-9]/.test(pwd)) {
      toast.error('Password must contain at least one special character');
      return;
    }

    setIsSaving('team');
    try {
      const response = (await apiClient.createUser(newUserForm)) as any;
      if (response.success) {
        toast.success('User created successfully');
        setShowAddUserModal(false);
        setNewUserForm({ email: '', firstName: '', lastName: '', phone: '', jobTitle: '', role: 'JUNIOR', password: '' });
        loadUsers();
      } else {
        toast.error(response.error?.message || 'Failed to create user');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to create user');
    } finally {
      setIsSaving(null);
    }
  };

  const openEditUser = (member: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    jobTitle?: string;
    role: string;
  }) => {
    setEditingUserId(member.id);
    setEditUserForm({
      email: member.email || '',
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      phone: member.phone || '',
      jobTitle: member.jobTitle || '',
      role: member.role || 'JUNIOR',
    });
    setShowEditUserModal(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUserId) return;
    if (!editUserForm.firstName.trim() || !editUserForm.lastName.trim() || !editUserForm.email.trim()) {
      toast.error('First name, last name, and email are required');
      return;
    }
    setIsSaving('team');
    try {
      const response = (await apiClient.updateUser(editingUserId, {
        firstName: editUserForm.firstName.trim(),
        lastName: editUserForm.lastName.trim(),
        email: editUserForm.email.trim(),
        phone: editUserForm.phone.trim() || undefined,
        jobTitle: editUserForm.jobTitle.trim() || undefined,
        role: editUserForm.role,
      })) as any;
      if (response.success) {
        toast.success('Team member updated');
        setShowEditUserModal(false);
        setEditingUserId(null);
        loadUsers();
        if (editingUserId === user?.id && response.data) {
          setSession({ ...user!, ...response.data }, tenant!);
        }
      } else {
        toast.error(response.error?.message || 'Failed to update user');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to update user');
    } finally {
      setIsSaving(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this user?')) return;

    try {
      const response = (await apiClient.deleteUser(userId)) as any;
      if (response.success) {
        toast.success('User removed successfully');
        loadUsers();
      }
    } catch (error) {
      toast.error('Failed to remove user');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 pb-5">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
          Manage your account, practice details, and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Sidebar - Modern card style */}
        <div className="lg:w-72 flex-shrink-0">
          <nav className="space-y-2 glass-tile p-3">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                className={`w-full flex items-start px-4 py-3.5 text-left rounded-xl transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm border border-primary-200/50 dark:border-primary-800/50'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-200 dark:hover:border-slate-700 border border-transparent'
                }`}
              >
                <tab.icon
                  className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                    activeTab === tab.id ? 'text-primary-500 dark:text-primary-400' : 'text-slate-400 dark:text-slate-400'
                  }`}
                />
                <div className="ml-3">
                  <p
                    className={`text-sm font-semibold ${activeTab === tab.id ? 'text-primary-900 dark:text-primary-100' : 'text-slate-900 dark:text-white'}`}
                  >
                    {tab.name}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${activeTab === tab.id ? 'text-primary-600 dark:text-primary-300' : 'text-slate-500 dark:text-slate-300'}`}
                  >
                    {tab.description}
                  </p>
                </div>
              </button>
            ))}
          </nav>

          {/* Quick Help Card */}
          <div className="mt-4 glass-tile bg-gradient-to-br from-primary-500/95 to-primary-600/95 border-primary-400/30 p-5 text-white">
            <h4 className="font-semibold text-sm">Need Help?</h4>
            <p className="text-xs text-primary-100 mt-1.5">
              Contact support@capstonesoftware.co.uk for assistance with settings.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-8">
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="glass-tile overflow-hidden">
              <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">My Profile</h2>
                <p className="text-sm text-slate-500 dark:text-slate-300">Update your personal information</p>
              </div>
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">First Name</label>
                    <input
                      type="text"
                      value={profileForm.firstName}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, firstName: e.target.value })
                      }
                      className="mt-1 input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">Last Name</label>
                    <input
                      type="text"
                      value={profileForm.lastName}
                      onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                      className="mt-1 input-field w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">Phone</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="mt-1 input-field w-full"
                      placeholder="Your contact number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">Job Title</label>
                    <input
                      type="text"
                      value={profileForm.jobTitle}
                      onChange={(e) => setProfileForm({ ...profileForm, jobTitle: e.target.value })}
                      className="mt-1 input-field w-full"
                      placeholder="e.g., Senior Accountant"
                    />
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSaving === 'profile'}
                    className="btn-primary"
                  >
                    {isSaving === 'profile' ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PRACTICE TAB - Combined Company + Legal */}
          {activeTab === 'practice' && (
            <div className="space-y-6">
              {/* Company Details */}
              <div className="glass-tile overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Practice Details</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">Your company information</p>
                </div>
                <div className="p-8 space-y-8">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                      Practice Name
                    </label>
                    <input
                      type="text"
                      value={practiceForm.name}
                      onChange={(e) => setPracticeForm({ ...practiceForm, name: e.target.value })}
                      className="mt-1 input-field w-full"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Company Registration Number
                      </label>
                      <input
                        type="text"
                        value={practiceForm.companyRegistration}
                        onChange={(e) =>
                          setPracticeForm({ ...practiceForm, companyRegistration: e.target.value })
                        }
                        className="mt-1 input-field w-full"
                        placeholder="e.g., 12345678"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Professional Body
                      </label>
                      <select
                        value={practiceForm.professionalBody}
                        onChange={(e) =>
                          setPracticeForm({ ...practiceForm, professionalBody: e.target.value })
                        }
                        className="mt-1 input-field w-full"
                      >
                        <option value="ACCA">ACCA</option>
                        <option value="ICAEW">ICAEW</option>
                        <option value="ICAS">ICAS</option>
                        <option value="CIMA">CIMA</option>
                        <option value="AAT">AAT</option>
                        <option value="CPAA">CPAA</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                      Registered Address
                    </label>
                    <textarea
                      value={practiceForm.address}
                      onChange={(e) =>
                        setPracticeForm({ ...practiceForm, address: e.target.value })
                      }
                      rows={4}
                      className="mt-1 input-field w-full"
                      placeholder="Street address&#10;City&#10;Postcode"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Practice Phone
                      </label>
                      <input
                        type="tel"
                        value={practiceForm.phone}
                        onChange={(e) =>
                          setPracticeForm({ ...practiceForm, phone: e.target.value })
                        }
                        className="mt-1 input-field w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">Website</label>
                      <input
                        type="url"
                        value={practiceForm.website}
                        onChange={(e) =>
                          setPracticeForm({ ...practiceForm, website: e.target.value })
                        }
                        className="mt-1 input-field w-full"
                        placeholder="https://"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Legal & Compliance */}
              <div className="glass-tile overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Legal & Compliance</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Professional indemnity and regulatory information
                  </p>
                </div>
                <div className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Professional Indemnity Insurer
                      </label>
                      <input
                        type="text"
                        value={practiceForm.insurerName}
                        onChange={(e) =>
                          setPracticeForm({ ...practiceForm, insurerName: e.target.value })
                        }
                        className="mt-1 input-field w-full"
                        placeholder="e.g., Hiscox, AIG"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Governing Law
                      </label>
                      <select
                        value={practiceForm.governingLaw}
                        onChange={(e) =>
                          setPracticeForm({ ...practiceForm, governingLaw: e.target.value })
                        }
                        className="mt-1 input-field w-full"
                      >
                        <option value="England and Wales">England and Wales</option>
                        <option value="Scotland">Scotland</option>
                        <option value="Northern Ireland">Northern Ireland</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="fcaAuthorised"
                      checked={practiceForm.fcaAuthorised}
                      onChange={(e) =>
                        setPracticeForm({ ...practiceForm, fcaAuthorised: e.target.checked })
                      }
                      className="h-4 w-4 text-primary-600 dark:text-primary-400 rounded border-slate-300 dark:border-slate-500"
                    />
                    <label htmlFor="fcaAuthorised" className="ml-2 text-sm text-slate-800 dark:text-slate-200">
                      FCA Authorised (for regulated activities)
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                      Privacy Policy URL
                    </label>
                    <input
                      type="url"
                      value={practiceForm.privacyPolicyUrl}
                      onChange={(e) =>
                        setPracticeForm({ ...practiceForm, privacyPolicyUrl: e.target.value })
                      }
                      className="mt-1 input-field w-full"
                      placeholder="https://yourwebsite.com/privacy"
                    />
                  </div>
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={handleSavePractice}
                      disabled={isSaving === 'practice'}
                      className="btn-primary"
                    >
                      {isSaving === 'practice' ? 'Saving...' : 'Save Practice Settings'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BRANDING TAB */}
          {activeTab === 'branding' && (
            <div className="glass-tile overflow-hidden">
              <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Branding</h2>
                <p className="text-sm text-slate-500 dark:text-slate-300">Customise your proposal appearance</p>
              </div>
              <div className="p-6 space-y-8">
                {/* Logo Upload */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100 mb-3">
                    Practice Logo
                  </label>
                  <div className="flex items-start space-x-6">
                    <div className="w-32 h-32 border-2 border-dashed border-slate-300 dark:border-slate-500 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
                      {brandingForm.logo ? (
                        <img
                          src={brandingForm.logo}
                          alt="Logo"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <BuildingOfficeIcon className="h-12 w-12 text-slate-400 dark:text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="block w-full text-sm text-slate-500 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-900/30 dark:file:text-primary-300"
                      />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
                        Recommended: PNG or SVG with transparent background. Max 2MB.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Primary Color */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100 mb-3">
                    Primary Brand Color
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="color"
                      value={brandingForm.primaryColor}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, primaryColor: e.target.value })
                      }
                      className="h-12 w-12 rounded-lg border border-slate-300 dark:border-slate-500 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={brandingForm.primaryColor}
                      onChange={(e) =>
                        setBrandingForm({ ...brandingForm, primaryColor: e.target.value })
                      }
                      className="input-field w-32"
                    />
                    <div className="flex space-x-2">
                      {['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map(
                        (color) => (
                          <button
                            key={color}
                            onClick={() =>
                              setBrandingForm({ ...brandingForm, primaryColor: color })
                            }
                            className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-slate-500 shadow-sm hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                          />
                        )
                      )}
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100 mb-3">Preview</label>
                  <div
                    className="border rounded-lg p-6"
                    style={{ borderColor: brandingForm.primaryColor }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {brandingForm.logo && (
                          <img src={brandingForm.logo} alt="Logo" className="h-10" />
                        )}
                        <span
                          className="font-semibold text-lg"
                          style={{ color: brandingForm.primaryColor }}
                        >
                          {practiceForm.name || 'Your Practice Name'}
                        </span>
                      </div>
                      <span className="text-sm text-slate-500 dark:text-slate-300">PROPOSAL</span>
                    </div>
                    <div
                      className="mt-4 h-1 rounded"
                      style={{ backgroundColor: brandingForm.primaryColor }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleSaveBranding}
                    disabled={isSaving === 'branding'}
                    className="btn-primary"
                  >
                    {isSaving === 'branding' ? 'Saving...' : 'Save Branding'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* APPEARANCE TAB */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div className="glass-tile p-6">
                <div className="flex items-center gap-3 mb-4">
                  <SunIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Theme</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-300">Choose how Engage looks for you</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { value: 'light', label: 'Light', icon: SunIcon, desc: 'Always light' },
                    { value: 'dark', label: 'Dark', icon: MoonIcon, desc: 'Always dark' },
                    { value: 'system', label: 'System', icon: ComputerDesktopIcon, desc: 'Match your device' },
                  ].map((option) => {
                    const Icon = option.icon;
                    const isActive = currentTheme === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setCurrentTheme(option.value as any)}
                        className={`flex flex-col items-center p-5 rounded-2xl border transition-all ${
                          isActive
                            ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/30 ring-2 ring-primary-200 dark:ring-primary-700 shadow-sm'
                            : 'border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-700/70 hover:border-primary-200 dark:hover:border-slate-500'
                        }`}
                      >
                        <Icon className="h-8 w-8 mb-2 text-primary-500 dark:text-primary-300" />
                        <div className="font-semibold text-slate-900 dark:text-white">{option.label}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">{option.desc}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 text-xs text-slate-500 dark:text-slate-300">
                  Your preference is saved and will be remembered across sessions.
                </div>
              </div>

              {/* Clara & AI budget visibility (polish + transparency) */}
              <div className="glass-tile p-8">
                <div className="flex items-center gap-3 mb-5">
                  <SparklesIcon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Clara &amp; AI</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-300">Monthly usage and budget for Clara AI features</p>
                  </div>
                </div>

                {aiBudgetLoading ? (
                  <div className="text-sm text-slate-500 dark:text-slate-300">Loading Clara budget…</div>
                ) : aiBudgetError || !aiBudget ? (
                  <div className="text-sm text-amber-600 dark:text-amber-400">
                    {aiBudgetError || 'AI budget data unavailable.'}
                  </div>
                ) : (
                  <div>
                    <div className="text-sm text-slate-700 dark:text-slate-200 mb-2">
                      Clara budget this month: {aiBudget.usedThisMonth?.toLocaleString?.() ?? aiBudget.usedThisMonth} / {aiBudget.budgetMonthly?.toLocaleString?.() ?? aiBudget.budgetMonthly} tokens used (remaining {aiBudget.remaining?.toLocaleString?.() ?? aiBudget.remaining}). Calls: {aiBudget.aiCallsThisMonth ?? '—'}
                      {typeof aiBudget.callsWithLoggedTokens === 'number' && (
                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {aiBudget.callsWithLoggedTokens} with logged provider tokens
                          {aiBudget.callsEstimated > 0
                            ? ` · ${aiBudget.callsEstimated} estimated from older activity`
                            : ''}
                        </span>
                      )}
                    </div>

                    {/* Tailwind progress bar, perfect dark mode + pale light */}
                    {(() => {
                      const used = Number(aiBudget.usedThisMonth) || 0;
                      const total = Number(aiBudget.budgetMonthly) || 1;
                      const pct = Math.max(0, Math.min(100, Math.round((used / total) * 100)));
                      return (
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                          <div
                            className="h-2.5 rounded-full transition-all bg-violet-600 dark:bg-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      );
                    })()}

                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
                      Budget resets monthly. Usage is based on provider token counts where available.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* COMMUNICATIONS TAB */}
          {activeTab === 'communications' && (
            <div className="space-y-6">
              {/* Email Settings */}
              <div className="glass-tile overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Email Configuration</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Configure how emails are sent from the platform
                  </p>
                </div>
                <div className="p-6">
                  <EmailSettings />
                </div>
              </div>

              {/* Engagement clause library versioning */}
              <EngagementLibrarySettings />

              {/* Cover letter templates */}
              <div className="glass-tile overflow-hidden">
                <div className="p-6">
                  <CoverLetterTemplatesManager />
                </div>
              </div>

              <div className="glass-tile overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Voice of practice</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Train Clara to match your firm&apos;s letter style (W4.4)
                  </p>
                </div>
                <div className="p-6">
                  <VoiceOfPracticeSettings />
                </div>
              </div>

              {/* Proposal defaults */}
              <div className="glass-tile overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Proposal defaults</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Default expiry and renewal reminder timing for new proposals
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Default proposal validity (days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={communicationsForm.proposals.defaultExpiryDays}
                        onChange={(e) =>
                          setCommunicationsForm({
                            ...communicationsForm,
                            proposals: {
                              ...communicationsForm.proposals,
                              defaultExpiryDays: Number(e.target.value) || 30,
                            },
                          })
                        }
                        className="mt-1 input-field w-full"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                        Pre-fills the &quot;valid until&quot; date when creating a proposal
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Default payment terms (days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={communicationsForm.proposals.defaultPaymentTermsDays ?? 7}
                        onChange={(e) =>
                          setCommunicationsForm({
                            ...communicationsForm,
                            proposals: {
                              ...communicationsForm.proposals,
                              defaultPaymentTermsDays: Number(e.target.value) || 7,
                            },
                          })
                        }
                        className="mt-1 input-field w-full"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                        Invoices are payable within this many days (shown on proposals and engagement letters)
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Renewal / expiry reminder (days before)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={communicationsForm.proposals.renewalReminderDays}
                        onChange={(e) =>
                          setCommunicationsForm({
                            ...communicationsForm,
                            proposals: {
                              ...communicationsForm.proposals,
                              renewalReminderDays: Number(e.target.value) || 30,
                            },
                          })
                        }
                        className="mt-1 input-field w-full"
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                        Email reminders before proposal expiry or annual renewal
                      </p>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-3">
                    <button
                      onClick={handleSaveCommunications}
                      disabled={isSaving === 'communications'}
                      className="btn-primary"
                    >
                      {isSaving === 'communications' ? 'Saving...' : 'Save proposal defaults'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Notifications */}
              <div className="glass-tile overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Notification Preferences</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Choose when you receive email notifications
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  {[
                    {
                      key: 'proposalAccepted',
                      label: 'Proposal Accepted',
                      description: 'When a client accepts a proposal',
                    },
                    {
                      key: 'proposalViewed',
                      label: 'Proposal Viewed',
                      description: 'When a client views a shared proposal',
                    },
                    {
                      key: 'mtditsaDeadlines',
                      label: 'MTD ITSA Deadlines',
                      description: 'Upcoming compliance deadlines',
                    },
                    {
                      key: 'weeklySummary',
                      label: 'Weekly Summary',
                      description: 'Weekly activity digest every Monday',
                    },
                  ].map((item) => (
                    <div key={item.key} className="flex items-start py-1.5">
                      <input
                        type="checkbox"
                        id={item.key}
                        checked={
                          communicationsForm.notifications[
                            item.key as keyof typeof communicationsForm.notifications
                          ]
                        }
                        onChange={(e) =>
                          setCommunicationsForm({
                            ...communicationsForm,
                            notifications: {
                              ...communicationsForm.notifications,
                              [item.key]: e.target.checked,
                            },
                          })
                        }
                        className="h-4 w-4 mt-1 text-primary-600 dark:text-primary-400 rounded border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-primary-200"
                      />
                      <div className="ml-3">
                        <label htmlFor={item.key} className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                          {item.label}
                        </label>
                        <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">{item.description}</p>
                      </div>
                    </div>
                  ))}
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={handleSaveCommunications}
                      disabled={isSaving === 'communications'}
                      className="btn-primary"
                    >
                      {isSaving === 'communications' ? 'Saving...' : 'Save notifications'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* BILLING TAB */}
          {activeTab === 'billing' && (
            <div className="glass-tile overflow-hidden">
              <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">VAT & Billing Settings</h2>
                <p className="text-sm text-slate-500 dark:text-slate-300">Configure tax and billing preferences</p>
              </div>
              <div className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                      <input
                        type="checkbox"
                        checked={vatForm.vatRegistered}
                        onChange={(e) =>
                          setVatForm({ ...vatForm, vatRegistered: e.target.checked })
                        }
                        className="rounded border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-primary-200"
                      />
                      VAT registered
                    </label>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Show VAT on proposals and apply default rates</p>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                      <input
                        type="checkbox"
                        checked={vatForm.autoApplyVat}
                        onChange={(e) =>
                          setVatForm({ ...vatForm, autoApplyVat: e.target.checked })
                        }
                        className="rounded border-slate-300 dark:border-slate-500 focus:ring-2 focus:ring-primary-200"
                      />
                      Auto-apply VAT to new services
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                      VAT registration number
                    </label>
                    <input
                      type="text"
                      value={vatForm.vatNumber}
                      onChange={(e) => setVatForm({ ...vatForm, vatNumber: e.target.value })}
                      placeholder="GB 123 4567 89"
                      className="mt-1 input-field w-full"
                      disabled={!vatForm.vatRegistered}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                      Default VAT rate
                    </label>
                    <select
                      value={vatForm.defaultVatRate}
                      onChange={(e) =>
                        setVatForm({
                          ...vatForm,
                          defaultVatRate: e.target.value as typeof vatForm.defaultVatRate,
                        })
                      }
                      className="mt-1 input-field w-full"
                      disabled={!vatForm.vatRegistered}
                    >
                      <option value="STANDARD_20">Standard 20%</option>
                      <option value="REDUCED_5">Reduced 5%</option>
                      <option value="ZERO">Zero rated</option>
                      <option value="EXEMPT">Exempt</option>
                    </select>
                  </div>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-8">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    Payment collection at sign
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    Offer Direct Debit or card setup immediately after a client signs (Ignition-style).
                    Uses Adfin when configured; otherwise a demo GoCardless stub is used.
                  </p>
                  <div className="mt-4 space-y-4">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        data-testid="collect-payment-at-sign"
                        checked={paymentForm.collectPaymentAtSign}
                        onChange={(e) =>
                          setPaymentForm({ ...paymentForm, collectPaymentAtSign: e.target.checked })
                        }
                        className="mt-1 rounded border-slate-300 dark:border-slate-500"
                      />
                      <span>
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-100">
                          Collect payment at sign
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-300 mt-0.5">
                          Clients see a payment setup step after accepting the proposal
                        </span>
                      </span>
                    </label>
                    {paymentForm.collectPaymentAtSign && (
                      <div className="ml-7 space-y-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={paymentForm.allowDirectDebit}
                            onChange={(e) =>
                              setPaymentForm({ ...paymentForm, allowDirectDebit: e.target.checked })
                            }
                            className="rounded border-slate-300"
                          />
                          Direct Debit
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                          <input
                            type="checkbox"
                            checked={paymentForm.allowCard}
                            onChange={(e) =>
                              setPaymentForm({ ...paymentForm, allowCard: e.target.checked })
                            }
                            className="rounded border-slate-300"
                          />
                          Card
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSaveVat}
                  disabled={isSaving === 'billing'}
                  className="btn-primary"
                >
                  {isSaving === 'billing' ? 'Saving…' : 'Save billing settings'}
                </button>
              </div>
            </div>
          )}

          {/* TEAM TAB */}
          {activeTab === 'team' && (
            <div className="glass-tile overflow-hidden">
              <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Team Members</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">Manage users and their permissions</p>
                </div>
                <button onClick={() => setShowAddUserModal(true)} className="btn-primary text-sm">
                  Add User
                </button>
              </div>
              <div className="divide-y divide-slate-200">
                {isLoading ? (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-300">Loading...</div>
                ) : users.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 dark:text-slate-300">No users found</div>
                ) : (
                  users.map((u) => (
                    <div
                      key={u.id}
                      className="p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors rounded-lg"
                    >
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-primary-700 font-medium">
                            {u.firstName?.[0]}
                            {u.lastName?.[0]}
                          </span>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-slate-900">
                            {u.firstName} {u.lastName}
                            {u.id === user?.id && (
                              <span className="ml-2 text-xs text-primary-600 dark:text-primary-400">(You)</span>
                            )}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-300">{u.email}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                              {formatTeamRole(u.role)}
                            </span>
                            {u.jobTitle?.trim() && (
                              <span className="text-xs text-slate-500 dark:text-slate-400">{u.jobTitle}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEditUser(u)}
                          className="text-primary-600 hover:text-primary-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        {u.id !== user?.id && (
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add User Modal */}
              {showAddUserModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Add Team Member</h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                            First Name
                          </label>
                          <input
                            type="text"
                            value={newUserForm.firstName}
                            onChange={(e) =>
                              setNewUserForm({ ...newUserForm, firstName: e.target.value })
                            }
                            className="mt-1 input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                            Last Name
                          </label>
                          <input
                            type="text"
                            value={newUserForm.lastName}
                            onChange={(e) =>
                              setNewUserForm({ ...newUserForm, lastName: e.target.value })
                            }
                            className="mt-1 input-field w-full"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">Contact Number</label>
                          <input
                            type="tel"
                            value={newUserForm.phone}
                            onChange={(e) =>
                              setNewUserForm({ ...newUserForm, phone: e.target.value })
                            }
                            className="mt-1 input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">Job Title</label>
                          <input
                            type="text"
                            value={newUserForm.jobTitle}
                            onChange={(e) =>
                              setNewUserForm({ ...newUserForm, jobTitle: e.target.value })
                            }
                            className="mt-1 input-field w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">Email</label>
                        <input
                          type="email"
                          value={newUserForm.email}
                          onChange={(e) =>
                            setNewUserForm({ ...newUserForm, email: e.target.value })
                          }
                          className="mt-1 input-field w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">Role</label>
                        <select
                          value={newUserForm.role}
                          onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                          className="mt-1 input-field w-full"
                        >
                          <option value="PARTNER">Partner</option>
                          <option value="MANAGER">Manager</option>
                          <option value="SENIOR">Senior</option>
                          <option value="JUNIOR">Junior</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                          Temporary Password
                        </label>
                        <input
                          type="password"
                          value={newUserForm.password}
                          onChange={(e) =>
                            setNewUserForm({ ...newUserForm, password: e.target.value })
                          }
                          className="mt-1 input-field w-full"
                          placeholder="Min 8 characters with complexity"
                        />
                        {/* Password Requirements */}
                        <div className="mt-2 space-y-1">
                          {[
                            { test: newUserForm.password.length >= 8, label: '8+ characters' },
                            { test: /[A-Z]/.test(newUserForm.password), label: 'Uppercase' },
                            { test: /[a-z]/.test(newUserForm.password), label: 'Lowercase' },
                            { test: /[0-9]/.test(newUserForm.password), label: 'Number' },
                            {
                              test: /[^A-Za-z0-9]/.test(newUserForm.password),
                              label: 'Special char',
                            },
                          ].map((req, i) => (
                            <div key={i} className="flex items-center text-xs">
                              <span
                                className={`mr-2 ${req.test ? 'text-green-500' : 'text-slate-400 dark:text-slate-500'}`}
                              >
                                {req.test ? '✓' : '○'}
                              </span>
                              <span className={req.test ? 'text-green-700' : 'text-slate-500 dark:text-slate-300'}>
                                {req.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex space-x-3">
                      <button
                        onClick={() => setShowAddUserModal(false)}
                        className="flex-1 btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateUser}
                        disabled={isSaving === 'team'}
                        className="flex-1 btn-primary"
                      >
                        {isSaving === 'team' ? 'Adding...' : 'Add User'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showEditUserModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                      Edit Team Member
                    </h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                            First Name
                          </label>
                          <input
                            type="text"
                            value={editUserForm.firstName}
                            onChange={(e) =>
                              setEditUserForm({ ...editUserForm, firstName: e.target.value })
                            }
                            className="mt-1 input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                            Last Name
                          </label>
                          <input
                            type="text"
                            value={editUserForm.lastName}
                            onChange={(e) =>
                              setEditUserForm({ ...editUserForm, lastName: e.target.value })
                            }
                            className="mt-1 input-field w-full"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                            Contact Number
                          </label>
                          <input
                            type="tel"
                            value={editUserForm.phone}
                            onChange={(e) =>
                              setEditUserForm({ ...editUserForm, phone: e.target.value })
                            }
                            className="mt-1 input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                            Job Title
                          </label>
                          <input
                            type="text"
                            value={editUserForm.jobTitle}
                            onChange={(e) =>
                              setEditUserForm({ ...editUserForm, jobTitle: e.target.value })
                            }
                            className="mt-1 input-field w-full"
                            placeholder="e.g. Director, Partner"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                          Email
                        </label>
                        <input
                          type="email"
                          value={editUserForm.email}
                          onChange={(e) =>
                            setEditUserForm({ ...editUserForm, email: e.target.value })
                          }
                          className="mt-1 input-field w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                          Role
                        </label>
                        <select
                          value={editUserForm.role}
                          onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                          className="mt-1 input-field w-full"
                        >
                          <option value="PARTNER">Partner</option>
                          <option value="MANAGER">Manager</option>
                          <option value="SENIOR">Senior</option>
                          <option value="JUNIOR">Junior</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-6 flex space-x-3">
                      <button
                        onClick={() => {
                          setShowEditUserModal(false);
                          setEditingUserId(null);
                        }}
                        className="flex-1 btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleUpdateUser}
                        disabled={isSaving === 'team'}
                        className="flex-1 btn-primary"
                      >
                        {isSaving === 'team' ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <div className="glass-tile overflow-hidden">
              <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Security</h2>
                <p className="text-sm text-slate-500 dark:text-slate-300">Manage your password and account security</p>
              </div>
              <div className="p-8 space-y-8">
                <div>
                  <h3 className="text-sm font-medium text-slate-900 mb-4">Change Password</h3>
                  <div className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                        }
                        className="mt-1 input-field w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                        }
                        className="mt-1 input-field w-full"
                      />
                      {/* Password Requirements */}
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-slate-500 dark:text-slate-300 font-medium">Password requirements:</p>
                        {[
                          {
                            test: passwordForm.newPassword.length >= 8,
                            label: 'At least 8 characters',
                          },
                          {
                            test: /[A-Z]/.test(passwordForm.newPassword),
                            label: 'One uppercase letter',
                          },
                          {
                            test: /[a-z]/.test(passwordForm.newPassword),
                            label: 'One lowercase letter',
                          },
                          { test: /[0-9]/.test(passwordForm.newPassword), label: 'One number' },
                          {
                            test: /[^A-Za-z0-9]/.test(passwordForm.newPassword),
                            label: 'One special character',
                          },
                        ].map((req, i) => (
                          <div key={i} className="flex items-center text-xs">
                            <span
                              className={`mr-2 ${req.test ? 'text-green-500' : 'text-slate-400 dark:text-slate-500'}`}
                            >
                              {req.test ? '✓' : '○'}
                            </span>
                            <span className={req.test ? 'text-green-700' : 'text-slate-500 dark:text-slate-300'}>
                              {req.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-100">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) =>
                          setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                        }
                        className="mt-1 input-field w-full"
                      />
                    </div>
                    <button
                      onClick={handleChangePassword}
                      disabled={isSaving === 'security'}
                      className="btn-primary"
                    >
                      {isSaving === 'security' ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-2">
                    Two-Factor Authentication
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-300 mb-4">
                    {user?.twoFactorEnabled
                      ? 'Your account is protected with an authenticator app.'
                      : 'Add an extra layer of security using an authenticator app.'}
                  </p>
                  {user?.twoFactorEnabled ? (
                    <div className="space-y-3">
                      <span className="inline-flex items-center text-sm text-green-600">
                        <ShieldCheckIcon className="w-4 h-4 mr-1" />
                        2FA is enabled
                      </span>
                      <div className="flex flex-col sm:flex-row gap-2 max-w-md">
                        <input
                          type="password"
                          value={disable2FAPassword}
                          onChange={(e) => setDisable2FAPassword(e.target.value)}
                          placeholder="Password to disable 2FA"
                          className="input-field flex-1"
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleDisable2FA}
                          disabled={isDisabling2FA || !disable2FAPassword}
                        >
                          {isDisabling2FA ? 'Disabling...' : 'Disable 2FA'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => navigate('/2fa-setup')}
                    >
                      Enable 2FA
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AUTOMATION / TOUCHPOINTS TAB */}
          {activeTab === 'automation' && (
            <AutomationTab />
          )}

          {/* INTEGRATIONS TAB */}
          {activeTab === 'firm-group' && (
            <div className="glass-tile overflow-hidden">
              <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Firm group</h2>
                <p className="text-sm text-slate-500 dark:text-slate-300">
                  Link practices across offices — owner practice admins manage membership
                </p>
              </div>
              <div className="p-6">
                <FirmGroupSettings />
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-6">
              <div className="glass-tile overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Accounting integrations
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Connect Xero to sync clients and push accepted proposal summaries
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <XeroConnect />
                  <QuickBooksConnect />
                </div>
              </div>

              <div className="glass-tile overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Zapier &amp; HubSpot events (W4.2)
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    Proposal lifecycle webhooks for automation platforms
                  </p>
                </div>
                <div className="p-6">
                  <WebhookSettings />
                </div>
              </div>

              <div className="glass-tile overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-800/30">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    What&apos;s implemented (W1.1–W1.2)
                  </h2>
                </div>
                <div className="p-6 text-sm text-slate-600 dark:text-slate-300 space-y-2">
                  <p>
                    <span className="font-medium text-green-700 dark:text-green-400">Live:</span>{' '}
                    OAuth connect, client import (dedupe by email/name), contact notes on accepted
                    proposals.
                  </p>
                  <p>
                    <span className="font-medium text-amber-700 dark:text-amber-400">Stub:</span>{' '}
                    Repeating invoice / mandate draft — returned in API response only until revenue
                    account mapping (full W1.2).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Automation / Touchpoint Admin UI ---
const LIFECYCLE_STAGES = [
  'PROPOSAL_ACCEPTED', 'AML_PENDING', 'AML_COMPLETE', 'ENGAGEMENT_LETTER_SENT',
  'ENGAGEMENT_LETTER_SIGNED', 'INFO_REQUESTED', 'INFO_RECEIVED', 'ONBOARDING_SETUP',
  'KICKOFF_SENT', 'MILESTONE_CHECK_IN', 'SATISFACTION_CHECK', 'ONGOING', 'ANNUAL_REVIEW',
] as const;

function AutomationTab() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [automationSettings, setAutomationSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ subject: '', body: '', tone: 'WARM', isMarketing: false, isActive: true });

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, aRes, sRes] = await Promise.all([
        apiClient.getTouchpointTemplates(),
        apiClient.getTouchpointApprovals(),
        apiClient.getAutomationSettings(),
      ]);
      setTemplates((tRes as any).data || []);
      setApprovals((aRes as any).data || []);
      setAutomationSettings((sRes as any).data || null);
    } catch (e) {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openEditor = (stage: string) => {
    const existing = templates.find((t: any) => t.stage === stage);
    setEditing({ stage, ...existing });
    setForm({
      subject: existing?.subject || '',
      body: existing?.body || '',
      tone: existing?.tone || 'WARM',
      isMarketing: !!existing?.isMarketing,
      isActive: existing?.isActive !== false,
    });
  };

  const saveTemplate = async () => {
    if (!editing) return;
    try {
      await apiClient.upsertTouchpointTemplate(editing.stage, form);
      toast.success('Template saved');
      setEditing(null);
      await loadData();
    } catch (e) {
      toast.error('Failed to save template');
    }
  };

  const approve = async (id: string) => {
    try {
      await apiClient.approveTouchpoint(id);
      toast.success('Approved and sent');
      await loadData();
    } catch (e) {
      toast.error('Approval failed');
    }
  };

  const runEngine = async () => {
    try {
      await apiClient.runTouchpointEngine();
      toast.success('Engine run triggered');
      await loadData();
    } catch (e) {
      toast.error('Failed to run engine');
    }
  };

  return (
    <div className="space-y-6">
      {/* Beautiful intro explaining the value */}
      <div className="glass-tile p-6 bg-gradient-to-br from-primary-50/60 to-white dark:from-primary-950/30 dark:to-slate-900 border border-primary-100 dark:border-primary-900">
        <div className="flex items-start gap-4">
          <div className="mt-1 p-3 rounded-2xl bg-white/80 dark:bg-slate-800 shadow-sm">
            <SparklesIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold">Automated Client Touchpoints</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300 max-w-prose">
              Once a proposal is accepted, Engage automatically sends warm, timely messages at every stage — welcome, AML chase, engagement letters, info requests, milestone reminders, and annual reviews.
              You stay in control with per-stage templates, human approval gates, and the ability to pause any client.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={runEngine} className="btn-primary text-sm px-4 py-1.5">Run engine now</button>
            </div>
            {automationSettings?.emailFollowUp && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-300">
                Email follow-up: {automationSettings.emailFollowUp.enabled ? 'enabled' : 'disabled'}
                {automationSettings.proposalExpiry?.defaultExpiryDays
                  ? ` · Default proposal expiry ${automationSettings.proposalExpiry.defaultExpiryDays} days`
                  : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="glass-tile p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Stage Templates &amp; Controls</h3>
            <p className="text-sm text-slate-500 dark:text-slate-300">Toggle stages on/off and customise the wording clients receive.</p>
          </div>
          <button onClick={runEngine} className="btn-secondary text-sm hidden sm:block">Run Engine Now</button>
        </div>

        {/* Templates / Global Toggles */}
        <div className="mt-4">
          <h3 className="font-medium mb-2">Stage Templates &amp; Toggles</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {LIFECYCLE_STAGES.map((stage) => {
              const t = templates.find((x: any) => x.stage === stage);
              const isOn = t ? t.isActive : true;
              return (
                <div
                  key={stage}
                  className={`group rounded-2xl border p-4 transition-all hover:shadow-sm flex flex-col justify-between
                    ${isOn 
                      ? 'border-emerald-200 bg-white dark:bg-slate-900/60 dark:border-emerald-900' 
                      : 'border-slate-200 bg-slate-50/60 dark:bg-slate-900/40 opacity-90'}`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="font-semibold text-sm tracking-tight">{stage.replace(/_/g, ' ')}</div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${isOn ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40' : 'bg-slate-200 text-slate-600 dark:bg-slate-800'}`}>
                        {isOn ? 'ON' : 'PAUSED'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-300 line-clamp-2">
                      {t?.subject ? t.subject : 'Using default template'}
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => openEditor(stage)}
                      className="flex-1 btn-secondary text-xs py-1.5 group-hover:border-primary-300"
                    >
                      Edit template
                    </button>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={async () => {
                          const payload = t ? { ...t, isActive: !t.isActive } : { isActive: false };
                          await apiClient.upsertTouchpointTemplate(stage, payload);
                          loadData();
                        }}
                        className="accent-primary-600"
                      />
                      <span className="text-slate-500 dark:text-slate-300">Active</span>
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Approval Queue - more beautiful & actionable */}
      <div className="glass-tile p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Human Approval Queue</h3>
            <p className="text-xs text-slate-500 dark:text-slate-300">Touchpoints that require your sign-off before sending</p>
          </div>
          {approvals.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40">{approvals.length} pending</span>
          )}
        </div>

        {approvals.length === 0 && (
          <div className="text-center py-8 text-sm text-slate-500 border border-dashed rounded-2xl">
            No touchpoints waiting for approval right now. Beautiful.
          </div>
        )}

        <div className="space-y-3">
          {approvals.map((a: any) => (
            <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{a.stage?.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">•</span>
                  <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{a.client?.name}</span>
                </div>
                {a.template?.subject && (
                  <div className="text-xs text-slate-500 dark:text-slate-300 mt-0.5 truncate">“{a.template.subject}”</div>
                )}
                {a.scheduledFor && (
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Scheduled: {new Date(a.scheduledFor).toLocaleDateString('en-GB')}</div>
                )}
              </div>
              <button
                onClick={() => approve(a.id)}
                className="btn-primary text-xs whitespace-nowrap self-start sm:self-auto"
              >
                Approve &amp; Send
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Template Editor Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="glass-tile w-full max-w-2xl p-6 rounded-2xl">
            <h3 className="text-lg font-semibold mb-4">Edit Template — {editing.stage}</h3>

            <div className="space-y-4">
              <input
                className="input-field w-full"
                placeholder="Subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
              <textarea
                className="input-field w-full h-48 font-mono text-sm"
                placeholder="Body (HTML allowed). Example: Hi {{contact_name}}, thank you for choosing {{practice_name}}. Next: {{next_step}} by {{due_date}}."
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
              <div className="flex gap-4">
                <select className="input-field" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                  <option value="WARM">Warm</option>
                  <option value="NEUTRAL">Neutral</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isMarketing} onChange={(e) => setForm({ ...form, isMarketing: e.target.checked })} /> Marketing (requires consent)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
              <button onClick={saveTemplate} className="btn-primary">Save Template</button>
            </div>
            {/* Live-ish preview + merge tags */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-3">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-300 mb-1">Preview (example data)</div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <div className="font-medium mb-1">{form.subject || 'Subject line will appear here'}</div>
                  <div dangerouslySetInnerHTML={{ 
                    __html: (form.body || 'Your message body...').replace(/\{\{client_name\}\}/g, 'Acme Ltd')
                      .replace(/\{\{contact_name\}\}/g, 'Jane Smith')
                      .replace(/\{\{practice_name\}\}/g, 'Your Practice')
                      .replace(/\{\{next_step\}\}/g, 'Please upload your last 3 months of bank statements')
                      .replace(/\{\{due_date\}\}/g, '28 June 2026') 
                  }} />
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-300 mb-1">Merge tags</div>
                <div className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 rounded-xl p-3">
                  <div><code>{'{{client_name}}'}</code> — company</div>
                  <div><code>{'{{contact_name}}'}</code> — person</div>
                  <div><code>{'{{practice_name}}'}</code> — your firm</div>
                  <div><code>{'{{next_step}}'}</code> — recommended action</div>
                  <div><code>{'{{due_date}}'}</code> — when relevant</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
