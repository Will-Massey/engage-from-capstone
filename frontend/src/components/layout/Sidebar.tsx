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
  { name: 'Billing', href: '/subscription', icon: CreditCardIcon },
  { name: 'Settings', href: '/settings', icon: CogIcon },
];

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { user, tenant, clearAuth } = useAuthStore();
  const location = useLocation();
  
  const logoUrl = tenant?.logo || '/images/engage-logo.svg';

  const handleLogout = () => {
    clearAuth();
    window.location.href = '/login';
  };

  return (
    <>
      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 shadow-xl transform transition-transform duration-300 ease-in-out lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700">
          <div className="flex items-center">
            <img src={logoUrl} alt={tenant?.name || 'Engage'} className="h-8 w-auto" />
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <nav className="px-2 py-4 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={onClose}
              className={({ isActive }) =>
                `group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-100 hover:bg-slate-800'
                }`
              }
            >
              <item.icon
                className={`mr-3 h-5 w-5 flex-shrink-0 ${
                  location.pathname === item.href
                    ? 'text-white'
                    : 'text-slate-300 group-hover:text-white'
                }`}
              />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* User info at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-capstone-700">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-medium">
              {user?.firstName?.charAt(0)}
              {user?.lastName?.charAt(0)}
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-300 capitalize">{user?.role?.toLowerCase()}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 flex items-center w-full px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
            Logout
          </button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-64 lg:bg-slate-900 lg:flex lg:flex-col">
        <div className="flex items-center h-16 px-6 border-b border-slate-700">
          <img src={logoUrl} alt={tenant?.name || 'Engage by Capstone'} className="h-10 w-auto" />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-100 hover:bg-slate-800'
                }`
              }
            >
              <item.icon
                className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors ${
                  location.pathname === item.href
                    ? 'text-white'
                    : 'text-slate-300 group-hover:text-white'
                }`}
              />
              {item.name}
            </NavLink>
          ))}
        </nav>

        {/* User info at bottom */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-medium">
              {user?.firstName?.charAt(0)}
              {user?.lastName?.charAt(0)}
            </div>
            <div className="ml-3 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-slate-300 capitalize">{user?.role?.toLowerCase()}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 flex items-center w-full px-3 py-2 text-sm text-slate-100 hover:bg-slate-800 hover:text-white rounded-lg transition-colors"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
            Logout
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
