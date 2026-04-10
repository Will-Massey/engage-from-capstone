import { NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  DocumentTextIcon,
  UsersIcon,
  CogIcon,
  WrenchScrewdriverIcon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  CreditCardIcon,
  ChartPieIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Proposals', href: '/proposals', icon: DocumentTextIcon },
  { name: 'Clients', href: '/clients', icon: UsersIcon },
  { name: 'Services', href: '/services', icon: WrenchScrewdriverIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartPieIcon },
  { name: 'Billing', href: '/subscription', icon: CreditCardIcon },
  { name: 'Settings', href: '/settings', icon: CogIcon },
];

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { user, tenant, clearAuth } = useAuthStore();
  const location = useLocation();
  
  const logoUrl = tenant?.logo || '/images/capstone-logo.svg';

  const handleLogout = () => {
    clearAuth();
    window.location.href = '/login';
  };

  return (
    <>
      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-all duration-300 ease-in-out lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(226, 232, 240, 0.8)',
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.08)'
        }}
      >
        <div className="dark:hidden">
          <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200/80">
            <div className="flex items-center">
              <img src={logoUrl} alt={tenant?.name || 'Engage'} className="h-8 w-auto" />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100/80 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <nav className="px-3 py-4 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={onClose}
                data-tour={item.name.toLowerCase()}
                className={({ isActive }) =>
                  `group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-primary-700'
                      : 'text-slate-600 hover:text-slate-900'
                  }`
                }
                style={({ isActive }) => ({
                  background: isActive 
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)'
                    : 'transparent',
                  border: isActive ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid transparent'
                })}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                    location.pathname === item.href
                      ? 'text-primary-600'
                      : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* User info at bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200/80">
            <div className="glass-tile p-4">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
                  {user?.firstName?.charAt(0)}
                  {user?.lastName?.charAt(0)}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role?.toLowerCase()}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-3 flex items-center w-full px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100/50 rounded-lg transition-colors"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
        {/* Dark mode version */}
        <div className="hidden dark:block h-full"
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(15, 23, 42, 0.95) 100%)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
          <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700/80">
            <div className="flex items-center">
              <img src={logoUrl} alt={tenant?.name || 'Engage'} className="h-8 w-auto" />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <nav className="px-3 py-4 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={onClose}
                className={({ isActive }) =>
                  `group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-primary-300'
                      : 'text-slate-400 hover:text-slate-100'
                  }`
                }
                style={({ isActive }) => ({
                  background: isActive 
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)'
                    : 'transparent',
                  border: isActive ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent'
                })}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                    location.pathname === item.href
                      ? 'text-primary-400'
                      : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                {item.name}
              </NavLink>
            ))}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700/80">
            <div className="p-4 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)'
              }}>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
                  {user?.firstName?.charAt(0)}
                  {user?.lastName?.charAt(0)}
                </div>
                <div className="ml-3">
                  <p className="text-sm font-semibold text-slate-100">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role?.toLowerCase()}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-3 flex items-center w-full px-3 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-72 lg:flex lg:flex-col"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(226, 232, 240, 0.8)'
        }}>
        <div className="dark:hidden flex flex-col h-full">
          <div className="flex items-center h-16 px-6 border-b border-slate-200/80">
            <img src={logoUrl} alt={tenant?.name || 'Engage by Capstone'} className="h-10 w-auto" />
          </div>

          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto scrollbar-hide">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  `group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-primary-700'
                      : 'text-slate-600 hover:text-slate-900'
                  }`
                }
                style={({ isActive }) => ({
                  background: isActive 
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)'
                    : 'transparent',
                  border: isActive ? '1px solid rgba(99, 102, 241, 0.2)' : '1px solid transparent'
                })}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                    location.pathname === item.href
                      ? 'text-primary-600'
                      : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* User info at bottom */}
          <div className="p-4 border-t border-slate-200/80">
            <div className="glass-tile p-4">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
                  {user?.firstName?.charAt(0)}
                  {user?.lastName?.charAt(0)}
                </div>
                <div className="ml-3 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role?.toLowerCase()}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-3 flex items-center w-full px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100/50 rounded-lg transition-colors"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
        {/* Dark mode desktop sidebar */}
        <div className="hidden dark:flex dark:flex-col h-full"
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(15, 23, 42, 0.95) 100%)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
          <div className="flex items-center h-16 px-6 border-b border-slate-700/80">
            <img src={logoUrl} alt={tenant?.name || 'Engage by Capstone'} className="h-10 w-auto" />
          </div>

          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto scrollbar-hide">
            {navigation.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  `group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-primary-300'
                      : 'text-slate-400 hover:text-slate-100'
                  }`
                }
                style={({ isActive }) => ({
                  background: isActive 
                    ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)'
                    : 'transparent',
                  border: isActive ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent'
                })}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                    location.pathname === item.href
                      ? 'text-primary-400'
                      : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                />
                {item.name}
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-700/80">
            <div className="p-4 rounded-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)'
              }}>
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
                  {user?.firstName?.charAt(0)}
                  {user?.lastName?.charAt(0)}
                </div>
                <div className="ml-3 min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role?.toLowerCase()}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-3 flex items-center w-full px-3 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
