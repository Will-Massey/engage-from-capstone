import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
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
} from '@heroicons/react/24/outline';
import EmailSettings from '../components/email/EmailSettings';

// Simplified tabs - combined related sections
const tabs = [
  { id: 'profile', name: 'My Profile', icon: UserCircleIcon, description: 'Personal information' },
  { id: 'practice', name: 'Practice', icon: BuildingOfficeIcon, description: 'Company & legal details' },
  { id: 'branding', name: 'Branding', icon: PaintBrushIcon, description: 'Logo & colors' },
  { id: 'communications', name: 'Communications', icon: EnvelopeIcon, description: 'Email & templates' },
  { id: 'billing', name: 'Billing & VAT', icon: CalculatorIcon, description: 'Tax & payment settings' },
  { id: 'team', name: 'Team', icon: UsersIcon, description: 'Users & permissions' },
  { id: 'security', name: 'Security', icon: ShieldCheckIcon, description: 'Password & access' },
];

const Settings = () => {
  const { user, tenant, setAuth, token } = useAuthStore();
  const [activeTab, setActiveTab] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  
  // Profile form state
  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: '',
    jobTitle: '',
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

  // Team/Users state
  const [users, setUsers] = useState<any[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'JUNIOR',
    password: '',
  });

  // Load users when team tab is active
  useEffect(() => {
    if (activeTab === 'team') {
      loadUsers();
    }
  }, [activeTab]);

  // Load tenant settings on mount
  useEffect(() => {
    loadTenantSettings();
  }, []);

  const loadTenantSettings = async () => {
    try {
      const response = await apiClient.getTenantSettings() as any;
      if (response.success && response.data) {
        const data = response.data;
        setPracticeForm(prev => ({
          ...prev,
          name: data.branding?.name || prev.name,
          professionalBody: data.professionalBody || 'ACCA',
          companyRegistration: data.companyRegistration || '',
          address: data.address?.line1 ? 
            `${data.address.line1}\n${data.address.line2 || ''}\n${data.address.city}\n${data.address.postcode}` : '',
          phone: data.phone || '',
          website: data.website || '',
          insurerName: data.insurerName || '',
          governingLaw: data.governingLaw || 'England and Wales',
          fcaAuthorised: data.fcaAuthorised || false,
          privacyPolicyUrl: data.privacyPolicyUrl || '',
        }));
        setBrandingForm(prev => ({
          ...prev,
          primaryColor: data.branding?.primaryColor || prev.primaryColor,
          logo: data.branding?.logo || prev.logo,
        }));
        if (data.notifications) {
          setCommunicationsForm(prev => ({
            ...prev,
            notifications: { ...prev.notifications, ...data.notifications },
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
      const response = await apiClient.getUsers() as any;
      if (response.success) {
        setUsers(response.data || []);
      }
    } catch (error) {
      toast.error('Failed to load team members');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving('profile');
    try {
      const response = await apiClient.updateMe({
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        email: profileForm.email,
        phone: profileForm.phone,
        jobTitle: profileForm.jobTitle,
      }) as any;

      if (response.success) {
        setAuth(response.data.user, tenant, token);
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
      const response = await apiClient.updateTenantSettings({
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
      }) as any;

      if (response.success) {
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

  const handleSaveBranding = async () => {
    setIsSaving('branding');
    try {
      const response = await apiClient.updateTenantSettings({
        branding: {
          primaryColor: brandingForm.primaryColor,
          logo: brandingForm.logo,
        },
      }) as any;

      if (response.success) {
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
      setBrandingForm(prev => ({ ...prev, logo: base64 }));
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
      const response = await apiClient.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      }) as any;

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
      const response = await apiClient.createUser(newUserForm) as any;
      if (response.success) {
        toast.success('User created successfully');
        setShowAddUserModal(false);
        setNewUserForm({ email: '', firstName: '', lastName: '', role: 'JUNIOR', password: '' });
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

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this user?')) return;

    try {
      const response = await apiClient.deleteUser(userId) as any;
      if (response.success) {
        toast.success('User removed successfully');
        loadUsers();
      }
    } catch (error) {
      toast.error('Failed to remove user');
    }
  };

  // Cover letter template
  const defaultCoverTemplate = `Dear {{client.name}},

Thank you for considering {{tenant.name}} for your accounting and business advisory needs. We appreciate the opportunity to present this proposal outlining our services and how we can support your business.

Following a thorough understanding of your requirements, we have prepared a tailored service package designed to provide you with comprehensive support while ensuring compliance with all relevant regulations.

This proposal details:
• The specific services we recommend for your business
• Transparent pricing with no hidden costs
• Our terms of engagement and service standards
• Next steps to get started

We believe in building long-term partnerships with our clients based on trust, transparency, and exceptional service delivery.

Please review this proposal at your convenience. Should you have any questions or require any clarification, please do not hesitate to contact us.

We look forward to the possibility of working with you.

Yours sincerely,

{{user.firstName}} {{user.lastName}}
{{tenant.name}}`;

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your account, practice details, and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar - Modern card style */}
        <div className="lg:w-72 flex-shrink-0">
          <nav className="space-y-2 bg-white rounded-xl shadow-sm border border-slate-200 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-start px-4 py-3 text-left rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700 shadow-sm'
                    : 'text-slate-800 hover:bg-slate-50'
                }`}
              >
                <tab.icon
                  className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                    activeTab === tab.id ? 'text-primary-500' : 'text-slate-400'
                  }`}
                />
                <div className="ml-3">
                  <p className={`text-sm font-medium ${activeTab === tab.id ? 'text-primary-900' : 'text-slate-900'}`}>
                    {tab.name}
                  </p>
                  <p className={`text-xs ${activeTab === tab.id ? 'text-primary-600' : 'text-slate-600'}`}>
                    {tab.description}
                  </p>
                </div>
              </button>
            ))}
          </nav>

          {/* Quick Help Card */}
          <div className="mt-4 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl p-4 text-white">
            <h4 className="font-semibold text-sm">Need Help?</h4>
            <p className="text-xs text-primary-100 mt-1">
              Contact support@capstonesoftware.co.uk for assistance with settings.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h2 className="text-lg font-semibold text-slate-900">My Profile</h2>
                <p className="text-sm text-slate-600">Update your personal information</p>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-800">First Name</label>
                    <input
                      type="text"
                      value={profileForm.firstName}
                      onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                      className="mt-1 input-field w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Last Name</label>
                    <input
                      type="text"
                      value={profileForm.lastName}
                      onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                      className="mt-1 input-field w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800">Email</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                    className="mt-1 input-field w-full"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Phone</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="mt-1 input-field w-full"
                      placeholder="Your contact number"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Job Title</label>
                    <input
                      type="text"
                      value={profileForm.jobTitle}
                      onChange={(e) => setProfileForm({ ...profileForm, jobTitle: e.target.value })}
                      className="mt-1 input-field w-full"
                      placeholder="e.g., Senior Accountant"
                    />
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-200">
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
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-lg font-semibold text-slate-900">Practice Details</h2>
                  <p className="text-sm text-slate-600">Your company information</p>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Practice Name</label>
                    <input
                      type="text"
                      value={practiceForm.name}
                      onChange={(e) => setPracticeForm({ ...practiceForm, name: e.target.value })}
                      className="mt-1 input-field w-full"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Company Registration Number</label>
                      <input
                        type="text"
                        value={practiceForm.companyRegistration}
                        onChange={(e) => setPracticeForm({ ...practiceForm, companyRegistration: e.target.value })}
                        className="mt-1 input-field w-full"
                        placeholder="e.g., 12345678"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Professional Body</label>
                      <select
                        value={practiceForm.professionalBody}
                        onChange={(e) => setPracticeForm({ ...practiceForm, professionalBody: e.target.value })}
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
                    <label className="block text-sm font-medium text-slate-800">Registered Address</label>
                    <textarea
                      value={practiceForm.address}
                      onChange={(e) => setPracticeForm({ ...practiceForm, address: e.target.value })}
                      rows={4}
                      className="mt-1 input-field w-full"
                      placeholder="Street address&#10;City&#10;Postcode"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Practice Phone</label>
                      <input
                        type="tel"
                        value={practiceForm.phone}
                        onChange={(e) => setPracticeForm({ ...practiceForm, phone: e.target.value })}
                        className="mt-1 input-field w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Website</label>
                      <input
                        type="url"
                        value={practiceForm.website}
                        onChange={(e) => setPracticeForm({ ...practiceForm, website: e.target.value })}
                        className="mt-1 input-field w-full"
                        placeholder="https://"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Legal & Compliance */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-lg font-semibold text-slate-900">Legal & Compliance</h2>
                  <p className="text-sm text-slate-600">Professional indemnity and regulatory information</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Professional Indemnity Insurer</label>
                      <input
                        type="text"
                        value={practiceForm.insurerName}
                        onChange={(e) => setPracticeForm({ ...practiceForm, insurerName: e.target.value })}
                        className="mt-1 input-field w-full"
                        placeholder="e.g., Hiscox, AIG"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Governing Law</label>
                      <select
                        value={practiceForm.governingLaw}
                        onChange={(e) => setPracticeForm({ ...practiceForm, governingLaw: e.target.value })}
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
                      onChange={(e) => setPracticeForm({ ...practiceForm, fcaAuthorised: e.target.checked })}
                      className="h-4 w-4 text-primary-600 rounded border-slate-300"
                    />
                    <label htmlFor="fcaAuthorised" className="ml-2 text-sm text-slate-800">
                      FCA Authorised (for regulated activities)
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800">Privacy Policy URL</label>
                    <input
                      type="url"
                      value={practiceForm.privacyPolicyUrl}
                      onChange={(e) => setPracticeForm({ ...practiceForm, privacyPolicyUrl: e.target.value })}
                      className="mt-1 input-field w-full"
                      placeholder="https://yourwebsite.com/privacy"
                    />
                  </div>
                  <div className="pt-4 border-t border-slate-200">
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
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h2 className="text-lg font-semibold text-slate-900">Branding</h2>
                <p className="text-sm text-slate-600">Customize your proposal appearance</p>
              </div>
              <div className="p-6 space-y-8">
                {/* Logo Upload */}
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-3">Practice Logo</label>
                  <div className="flex items-start space-x-6">
                    <div className="w-32 h-32 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
                      {brandingForm.logo ? (
                        <img src={brandingForm.logo} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <BuildingOfficeIcon className="h-12 w-12 text-slate-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                      />
                      <p className="mt-2 text-xs text-slate-600">
                        Recommended: PNG or SVG with transparent background. Max 2MB.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Primary Color */}
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-3">Primary Brand Color</label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="color"
                      value={brandingForm.primaryColor}
                      onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                      className="h-12 w-12 rounded-lg border border-slate-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={brandingForm.primaryColor}
                      onChange={(e) => setBrandingForm({ ...brandingForm, primaryColor: e.target.value })}
                      className="input-field w-32"
                    />
                    <div className="flex space-x-2">
                      {['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'].map((color) => (
                        <button
                          key={color}
                          onClick={() => setBrandingForm({ ...brandingForm, primaryColor: color })}
                          className="w-8 h-8 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-3">Preview</label>
                  <div className="border rounded-lg p-6" style={{ borderColor: brandingForm.primaryColor }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {brandingForm.logo && (
                          <img src={brandingForm.logo} alt="Logo" className="h-10" />
                        )}
                        <span className="font-semibold text-lg" style={{ color: brandingForm.primaryColor }}>
                          {practiceForm.name || 'Your Practice Name'}
                        </span>
                      </div>
                      <span className="text-sm text-slate-600">PROPOSAL</span>
                    </div>
                    <div className="mt-4 h-1 rounded" style={{ backgroundColor: brandingForm.primaryColor }} />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200">
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

          {/* COMMUNICATIONS TAB */}
          {activeTab === 'communications' && (
            <div className="space-y-6">
              {/* Email Settings */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-lg font-semibold text-slate-900">Email Configuration</h2>
                  <p className="text-sm text-slate-600">Configure how emails are sent from the platform</p>
                </div>
                <div className="p-6">
                  <EmailSettings />
                </div>
              </div>

              {/* Cover Letter Template */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-lg font-semibold text-slate-900">Default Cover Letter Template</h2>
                  <p className="text-sm text-slate-600">Template used at the start of proposals before Terms & Conditions</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Available variables:</strong> {'{{client.name}}'}, {'{{tenant.name}}'}, {'{{user.firstName}}'}, {'{{user.lastName}}'}
                    </p>
                  </div>
                  <textarea
                    value={communicationsForm.defaultCoverTemplate || defaultCoverTemplate}
                    onChange={(e) => setCommunicationsForm({ ...communicationsForm, defaultCoverTemplate: e.target.value })}
                    rows={12}
                    className="input-field w-full font-mono text-sm"
                  />
                  <div className="pt-4 border-t border-slate-200">
                    <button 
                      onClick={() => toast.success('Template saved')}
                      disabled={isSaving === 'communications'}
                      className="btn-primary"
                    >
                      {isSaving === 'communications' ? 'Saving...' : 'Save Template'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Notifications */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                  <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
                  <p className="text-sm text-slate-600">Choose when you receive email notifications</p>
                </div>
                <div className="p-6 space-y-4">
                  {[
                    { key: 'proposalAccepted', label: 'Proposal Accepted', description: 'When a client accepts a proposal' },
                    { key: 'proposalViewed', label: 'Proposal Viewed', description: 'When a client views a shared proposal' },
                    { key: 'mtditsaDeadlines', label: 'MTD ITSA Deadlines', description: 'Upcoming compliance deadlines' },
                    { key: 'weeklySummary', label: 'Weekly Summary', description: 'Weekly activity digest every Monday' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-start">
                      <input
                        type="checkbox"
                        id={item.key}
                        checked={communicationsForm.notifications[item.key as keyof typeof communicationsForm.notifications]}
                        onChange={(e) => setCommunicationsForm({
                          ...communicationsForm,
                          notifications: { ...communicationsForm.notifications, [item.key]: e.target.checked }
                        })}
                        className="h-4 w-4 mt-1 text-primary-600 rounded border-slate-300"
                      />
                      <div className="ml-3">
                        <label htmlFor={item.key} className="text-sm font-medium text-slate-800">
                          {item.label}
                        </label>
                        <p className="text-xs text-slate-600">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* BILLING TAB */}
          {activeTab === 'billing' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h2 className="text-lg font-semibold text-slate-900">VAT & Billing Settings</h2>
                <p className="text-sm text-slate-600">Configure tax and billing preferences</p>
              </div>
              <div className="p-6">
                <div className="text-center py-12">
                  <CalculatorIcon className="mx-auto h-12 w-12 text-slate-400" />
                  <h3 className="mt-2 text-sm font-medium text-slate-900">VAT Settings</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Configure your VAT registration and default rates
                  </p>
                  <div className="mt-6">
                    <button
                      onClick={() => toast.info('VAT settings coming soon')}
                      className="btn-secondary"
                    >
                      Configure VAT
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TEAM TAB */}
          {activeTab === 'team' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
                  <p className="text-sm text-slate-600">Manage users and their permissions</p>
                </div>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="btn-primary text-sm"
                >
                  Add User
                </button>
              </div>
              <div className="divide-y divide-slate-200">
                {isLoading ? (
                  <div className="p-8 text-center text-slate-600">Loading...</div>
                ) : users.length === 0 ? (
                  <div className="p-8 text-center text-slate-600">No users found</div>
                ) : (
                  users.map((u) => (
                    <div key={u.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-primary-700 font-medium">
                            {u.firstName?.[0]}{u.lastName?.[0]}
                          </span>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-slate-900">
                            {u.firstName} {u.lastName}
                            {u.id === user?.id && (
                              <span className="ml-2 text-xs text-primary-600">(You)</span>
                            )}
                          </p>
                          <p className="text-sm text-slate-600">{u.email}</p>
                          <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                            {u.role}
                          </span>
                        </div>
                      </div>
                      {u.id !== user?.id && (
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      )}
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
                          <label className="block text-sm font-medium text-slate-800">First Name</label>
                          <input
                            type="text"
                            value={newUserForm.firstName}
                            onChange={(e) => setNewUserForm({ ...newUserForm, firstName: e.target.value })}
                            className="mt-1 input-field w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-800">Last Name</label>
                          <input
                            type="text"
                            value={newUserForm.lastName}
                            onChange={(e) => setNewUserForm({ ...newUserForm, lastName: e.target.value })}
                            className="mt-1 input-field w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-800">Email</label>
                        <input
                          type="email"
                          value={newUserForm.email}
                          onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                          className="mt-1 input-field w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-800">Role</label>
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
                        <label className="block text-sm font-medium text-slate-800">Temporary Password</label>
                        <input
                          type="password"
                          value={newUserForm.password}
                          onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
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
                            { test: /[^A-Za-z0-9]/.test(newUserForm.password), label: 'Special char' },
                          ].map((req, i) => (
                            <div key={i} className="flex items-center text-xs">
                              <span className={`mr-2 ${req.test ? 'text-green-500' : 'text-slate-400'}`}>
                                {req.test ? '✓' : '○'}
                              </span>
                              <span className={req.test ? 'text-green-700' : 'text-slate-600'}>{req.label}</span>
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
            </div>
          )}

          {/* SECURITY TAB */}
          {activeTab === 'security' && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h2 className="text-lg font-semibold text-slate-900">Security</h2>
                <p className="text-sm text-slate-600">Manage your password and account security</p>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-slate-900 mb-4">Change Password</h3>
                  <div className="space-y-4 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Current Password</label>
                      <input
                        type="password"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        className="mt-1 input-field w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800">New Password</label>
                      <input
                        type="password"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        className="mt-1 input-field w-full"
                      />
                      {/* Password Requirements */}
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-slate-600 font-medium">Password requirements:</p>
                        {[
                          { test: passwordForm.newPassword.length >= 8, label: 'At least 8 characters' },
                          { test: /[A-Z]/.test(passwordForm.newPassword), label: 'One uppercase letter' },
                          { test: /[a-z]/.test(passwordForm.newPassword), label: 'One lowercase letter' },
                          { test: /[0-9]/.test(passwordForm.newPassword), label: 'One number' },
                          { test: /[^A-Za-z0-9]/.test(passwordForm.newPassword), label: 'One special character' },
                        ].map((req, i) => (
                          <div key={i} className="flex items-center text-xs">
                            <span className={`mr-2 ${req.test ? 'text-green-500' : 'text-slate-400'}`}>
                              {req.test ? '✓' : '○'}
                            </span>
                            <span className={req.test ? 'text-green-700' : 'text-slate-600'}>{req.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800">Confirm New Password</label>
                      <input
                        type="password"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
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

                <div className="pt-6 border-t border-slate-200">
                  <h3 className="text-sm font-medium text-slate-900 mb-2">Two-Factor Authentication</h3>
                  <p className="text-sm text-slate-600 mb-4">Add an extra layer of security to your account</p>
                  <button
                    onClick={() => toast.info('2FA coming soon')}
                    className="btn-secondary"
                    disabled
                  >
                    Enable 2FA (Coming Soon)
                  </button>
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
