import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bars3Icon,
  PlusIcon,
  MagnifyingGlassIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';
import ThemeToggle from '../theme/ThemeToggle';
import NotificationsBell from './NotificationsBell';
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
        <div className="flex items-center min-w-0 flex-1 gap-2">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex min-h-11 min-w-11 items-center justify-center -ml-1 text-slate-500 dark:text-slate-300 rounded-xl hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 lg:hidden transition-colors cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>

          {/* One primary create path in the chrome — wizard is the short path */}
          <div className="hidden sm:flex items-center gap-2 ml-1">
            <Link to="/proposals/wizard" className="btn-primary btn-sm min-h-9">
              <PlusIcon className="w-4 h-4" aria-hidden />
              New proposal
            </Link>
            <Link to="/clients/new" className="btn-ghost btn-sm min-h-9 hidden md:inline-flex">
              New client
            </Link>
          </div>
        </div>

        {/* Right side — search is the jump UI; no duplicate Cmd+K chip */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 min-w-0 max-w-[55%] sm:max-w-none">
          <button
            type="button"
            onClick={openCommandPalette}
            className="md:hidden inline-flex min-h-11 min-w-11 items-center justify-center text-slate-500 dark:text-slate-300 rounded-xl hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
            aria-label="Search and jump to"
          >
            <MagnifyingGlassIcon className="w-6 h-6" />
          </button>

          <div className="hidden md:flex items-center">
            <button
              type="button"
              onClick={openCommandPalette}
              className="group relative flex items-center w-52 lg:w-72 cursor-pointer rounded-xl border border-slate-200/90 dark:border-slate-600/80 bg-white/80 dark:bg-slate-800/70 py-2 pl-9 pr-3 text-left text-sm text-slate-500 shadow-sm transition-colors hover:border-emerald-300/70 hover:bg-white dark:hover:border-emerald-700/50"
              data-tour="command-palette"
              aria-label="Open command palette"
            >
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-hover:text-emerald-600" />
              <span className="truncate">Search or jump…</span>
              <kbd className="ml-auto hidden lg:inline rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 dark:border-slate-600 dark:bg-slate-900">
                Ctrl K
              </kbd>
            </button>
          </div>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <NotificationsBell />

          {/* User menu */}
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 min-h-11 rounded-xl px-1.5 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors min-w-0 max-w-full cursor-pointer"
              title={fullName || undefined}
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                style={{ background: 'linear-gradient(135deg, #059669 0%, #34d399 100%)' }}
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
