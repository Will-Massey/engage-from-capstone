import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bars3Icon,
  PlusIcon,
  MagnifyingGlassIcon,
  BellIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';
import ThemeToggle from '../theme/ThemeToggle';
import toast from 'react-hot-toast';

interface HeaderProps {
  onMenuClick: () => void;
}

const Header = ({ onMenuClick }: HeaderProps) => {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = () => {
    clearAuth();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-700">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        {/* Left side */}
        <div className="flex items-center">
          <button
            onClick={onMenuClick}
            className="p-2 -ml-2 text-slate-300 rounded-lg hover:text-white hover:bg-slate-800 lg:hidden"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>

          {/* Quick actions */}
          <div className="hidden md:flex items-center ml-4 space-x-3">
            <Link
              to="/proposals/new"
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-all bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-500 hover:to-primary-600 shadow-lg shadow-primary-900/30"
            >
              <PlusIcon className="w-4 h-4 mr-1.5" />
              New Proposal
            </Link>
            <Link
              to="/clients/new"
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-slate-200 bg-slate-800 border border-slate-600 rounded-lg hover:bg-slate-700 hover:text-white transition-all"
            >
              <PlusIcon className="w-4 h-4 mr-1.5" />
              New Client
            </Link>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center space-x-4">
          {/* Search - hidden on mobile */}
          <div className="hidden md:flex items-center">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search..."
                className="w-64 pl-10 pr-4 py-1.5 text-sm bg-slate-800 border-slate-600 text-white placeholder-slate-400 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Notifications */}
          <button className="p-2 text-gray-400 rounded-lg hover:text-white hover:bg-capstone-800 relative">
            <BellIcon className="w-6 h-6" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full"></span>
          </button>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 p-2 rounded-lg hover:bg-capstone-800"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-medium">
                {user?.firstName?.charAt(0)}
              </div>
              <span className="hidden sm:block text-sm font-medium text-slate-200">
                {user?.firstName}
              </span>
            </button>

            {/* Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 animate-fade-in">
                <Link
                  to="/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <UserCircleIcon className="w-4 h-4 mr-2" />
                  Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <ArrowRightOnRectangleIcon className="w-4 h-4 mr-2" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile quick actions */}
      <div className="md:hidden px-4 pb-3 border-t border-capstone-800">
        <div className="flex space-x-2 mt-3">
          <Link
            to="/proposals/new"
            className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-blue-600 to-blue-700"
          >
            <PlusIcon className="w-4 h-4 mr-1.5" />
            New Proposal
          </Link>
          <Link
            to="/clients/new"
            className="flex-1 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-slate-200 bg-slate-800 border border-slate-600 rounded-lg hover:bg-slate-700 hover:text-white"
          >
            <PlusIcon className="w-4 h-4 mr-1.5" />
            New Client
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
