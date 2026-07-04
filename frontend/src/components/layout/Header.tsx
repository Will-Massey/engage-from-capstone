import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bars3Icon,
  PlusIcon,
  MagnifyingGlassIcon,
  BellIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';
import ThemeToggle from '../theme/ThemeToggle';
import { AiAssistantTrigger } from '../ai/AiAssistant';
import toast from 'react-hot-toast';
import useCommandPalette from '../../hooks/useCommandPalette';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header = ({ onMenuClick }: HeaderProps) => {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { open: openCommandPalette } = useCommandPalette();

  const handleLogout = () => {
    clearAuth();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  return (
    <div
      data-testid="app-header"
      className="px-4 sm:px-6 lg:px-8 pr-[max(1rem,env(safe-area-inset-right))]"
    >
      <div className="flex items-center justify-between h-16 min-w-0 gap-2">
        {/* Left side */}
        <div className="flex items-center min-w-0 flex-1">
          <button
            onClick={onMenuClick}
            className="p-2 -ml-2 text-slate-500 dark:text-slate-300 rounded-xl hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 lg:hidden transition-colors"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>

          {/* Quick actions - hidden on very small screens */}
          <div className="hidden sm:flex items-center ml-4 space-x-3">
            <Link to="/proposals/new" className="btn-primary" data-tour="create-proposal">
              <PlusIcon className="w-4 h-4 mr-1.5" />
              New Proposal
            </Link>
            <Link to="/clients/new" className="btn-secondary">
              <PlusIcon className="w-4 h-4 mr-1.5" />
              New Client
            </Link>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0 min-w-0 max-w-[55%] sm:max-w-none">
          <div className="hidden md:block">
            <AiAssistantTrigger />
          </div>
          <button
            type="button"
            onClick={openCommandPalette}
            className="md:hidden p-2 text-slate-500 dark:text-slate-300 rounded-xl hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors"
            aria-label="Search and jump to"
          >
            <MagnifyingGlassIcon className="w-6 h-6" />
          </button>

          <div className="hidden md:flex items-center">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Search or jump to…"
                className="search-input w-48 lg:w-64 cursor-pointer"
                readOnly
                onFocus={openCommandPalette}
                onClick={openCommandPalette}
                aria-label="Open command palette"
              />
            </div>
          </div>

          {/* Command Palette Button */}
          <button
            onClick={openCommandPalette}
            className="hidden sm:flex items-center px-3 py-1.5 text-sm text-slate-500 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
            data-tour="command-palette"
          >
            <CommandLineIcon className="w-4 h-4 mr-2" />
            <span className="hidden lg:inline">Cmd+K</span>
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <button className="p-2 text-slate-500 dark:text-slate-300 rounded-xl hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 relative transition-colors">
            <BellIcon className="w-6 h-6" />
            <span
              className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary-500 rounded-full"
              style={{ boxShadow: '0 0 8px rgba(99, 102, 241, 0.6)' }}
            ></span>
          </button>

          {/* User menu */}
          <div className="relative min-w-0">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-2 rounded-xl hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors min-w-0 max-w-full"
              title={fullName || undefined}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}
              >
                {user?.firstName?.charAt(0)}
              </div>
              <span
                data-testid="header-user-name"
                className="hidden sm:block text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[6rem] md:max-w-[9rem] lg:max-w-[12rem] xl:max-w-none"
              >
                {fullName || user?.firstName}
              </span>
            </button>

            {/* Dropdown */}
            {showUserMenu && (
              <div
                className="absolute right-0 mt-2 w-48 rounded-xl overflow-hidden animate-scale-in z-50"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
                }}
              >
                <div className="dark:hidden">
                  <Link
                    to="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <UserCircleIcon className="w-4 h-4 mr-3" />
                    Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <ArrowRightOnRectangleIcon className="w-4 h-4 mr-3" />
                    Logout
                  </button>
                </div>
                <div
                  className="hidden dark:block"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.9) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <Link
                    to="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    <UserCircleIcon className="w-4 h-4 mr-3" />
                    Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
                  >
                    <ArrowRightOnRectangleIcon className="w-4 h-4 mr-3" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
