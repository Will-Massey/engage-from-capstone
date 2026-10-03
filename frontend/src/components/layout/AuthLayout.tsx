import { useAuthStore } from '../../stores/authStore';
import { LegalFooterLinks } from '../legal/LegalPageLayout';
import { BrandLogo } from '../ui/BrandLogo';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { tenant } = useAuthStore();
  const practiceName = tenant?.name || 'Capstone Engage';

  return (
    <div className="auth-shell relative min-h-screen bg-slate-50">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-600/40 to-transparent" />

      <aside className="auth-brand">
        <BrandLogo
          tenantLogo={tenant?.logo}
          alt={practiceName}
          className="h-16 w-auto max-w-[12rem] object-contain object-left"
          frameClassName="px-0"
        />
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">
          {practiceName}
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
          Proposals, clients, and jobs for the practice. The same account as the office, laid out
          for the screen in your hand.
        </p>
        <ul className="mt-8 space-y-3 text-sm text-slate-700">
          <li>Clients, proposals, and jobs in one account.</li>
          <li>A sidebar on a tablet. A single column on a phone.</li>
        </ul>
      </aside>

      <div className="auth-pane flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="auth-phone-mark relative sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex flex-col items-center">
            <BrandLogo
              tenantLogo={tenant?.logo}
              alt={practiceName}
              className="h-24 w-auto max-w-[14rem] object-contain sm:h-28"
              frameClassName="px-1"
            />
            <p className="mt-4 text-center text-sm text-ink-500">
              Professional proposal generation for UK accountants
            </p>
          </div>
        </div>

        <div className="auth-form relative mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="border border-slate-200 bg-white px-6 py-8 shadow-[0_1px_2px_0_rgba(10,10,10,0.04),0_12px_32px_-12px_rgba(10,10,10,0.12)] sm:rounded-2xl sm:px-10">
            {children}
          </div>
        </div>

        <div className="relative mt-8 space-y-2 text-center sm:mx-auto sm:w-full sm:max-w-md">
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
