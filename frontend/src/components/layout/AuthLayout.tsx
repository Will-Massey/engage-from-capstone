import { useAuthStore } from '../../stores/authStore';
import { LegalFooterLinks } from '../legal/LegalPageLayout';
import { DEFAULT_LOGO_URL } from '../../utils/brandLogo';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { tenant } = useAuthStore();
  const logoUrl = tenant?.logo || DEFAULT_LOGO_URL;

  return (
    <div className="min-h-screen flex flex-col justify-center bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-capstone-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        ></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-primary-500/5 to-transparent rounded-full"></div>
      </div>

      <div className="relative sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <div className="flex items-center space-x-3">
            <img src={logoUrl} alt={tenant?.name || 'Engage by Capstone'} className="h-16 w-auto" />
          </div>
          <p className="mt-4 text-center text-sm text-slate-400">
            Professional proposal generation for UK accountants
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="glass-card bg-white/5 dark:bg-slate-900/50 backdrop-blur-xl py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10 border border-white/10 dark:border-slate-700/50">
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center space-y-2">
          <LegalFooterLinks />
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Capstone. All rights reserved.
          </p>
          <p className="text-xs text-slate-600">
            MTD ITSA Ready &bull; UK Compliant &bull; Secure & Private
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
