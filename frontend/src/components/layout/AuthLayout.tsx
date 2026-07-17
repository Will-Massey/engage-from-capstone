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
    <div className="min-h-screen flex flex-col justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 relative">
      {/* Hairline top accent — quiet brand detail */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-600/40 to-transparent" />

      <div className="relative sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <img src={logoUrl} alt={tenant?.name || 'Engage by Capstone'} className="h-12 w-auto" />
          <p className="mt-3 text-center text-sm text-ink-500">
            Professional proposal generation for UK accountants
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-6 sm:rounded-2xl sm:px-10 border border-slate-200 shadow-[0_1px_2px_0_rgba(10,10,10,0.04),0_12px_32px_-12px_rgba(10,10,10,0.12)]">
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center space-y-2">
          <LegalFooterLinks />
          <p className="text-xs text-ink-400">
            &copy; {new Date().getFullYear()} Capstone. All rights reserved.
          </p>
          <p className="text-xs text-ink-400">
            MTD ITSA Ready &bull; UK Compliant &bull; Secure &amp; Private
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
