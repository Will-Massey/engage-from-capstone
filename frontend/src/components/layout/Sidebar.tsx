import { useLocation } from 'react-router-dom';
import { XMarkIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../../stores/authStore';
import { appPath } from '../../utils/appBase';
import SidebarNavItems from './SidebarNavItems';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const SidebarPanel = ({
  logoUrl,
  tenantName,
  pathname,
  onClose,
  onLogout,
  showClose,
}: {
  logoUrl: string;
  tenantName: string;
  pathname: string;
  onClose?: () => void;
  onLogout: () => void;
  showClose?: boolean;
}) => (
  <div className="flex flex-col h-full">
    <div className="flex items-center h-16 px-4 sm:px-6 border-b border-slate-200/80 dark:border-slate-700/80 shrink-0">
      <img src={logoUrl} alt={tenantName} className="h-8 sm:h-10 w-auto" />
      {showClose && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="ml-auto p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors lg:hidden"
          aria-label="Close menu"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      )}
    </div>

    <nav className="flex-1 px-2 py-4 overflow-y-auto scrollbar-hide" aria-label="Main">
      <SidebarNavItems pathname={pathname} onNavigate={onClose} />
    </nav>

    <div className="p-3 sm:p-4 border-t border-slate-200/80 dark:border-slate-700/80 shrink-0 min-w-0">
      <UserFooter onLogout={onLogout} />
    </div>
  </div>
);

const UserFooter = ({ onLogout }: { onLogout: () => void }) => {
  const { user } = useAuthStore();
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  return (
    <div className="glass-tile !p-3 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}
        >
          {user?.firstName?.charAt(0)}
          {user?.lastName?.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words"
            title={fullName || undefined}
          >
            {fullName || '—'}
          </p>
          <p className="text-xs text-slate-500 capitalize truncate">{user?.role?.toLowerCase()}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="mt-3 flex items-center w-full px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
      >
        <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
        Logout
      </button>
    </div>
  );
};

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { tenant, clearAuth } = useAuthStore();
  const { pathname } = useLocation();
  const logoUrl = tenant?.logo || '/capstone-logo.jpg';
  const tenantName = tenant?.name || 'Engage by Capstone';

  const handleLogout = () => {
    clearAuth();
    window.location.href = appPath('/login');
  };

  const shellClass =
    'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-slate-200/80 dark:border-slate-700/80';

  return (
    <>
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 xl:w-80 transform transition-transform duration-300 ease-in-out lg:hidden border-r shadow-xl ${shellClass} ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarPanel
          logoUrl={logoUrl}
          tenantName={tenantName}
          pathname={pathname}
          onClose={onClose}
          onLogout={handleLogout}
          showClose
        />
      </div>

      <aside
        className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-72 xl:w-80 lg:flex-col border-r ${shellClass}`}
      >
        <SidebarPanel
          logoUrl={logoUrl}
          tenantName={tenantName}
          pathname={pathname}
          onLogout={handleLogout}
        />
      </aside>
    </>
  );
};

export default Sidebar;
