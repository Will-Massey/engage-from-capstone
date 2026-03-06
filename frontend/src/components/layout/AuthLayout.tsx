import { useAuthStore } from '../../stores/authStore';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  const { tenant } = useAuthStore();
  const logoUrl = tenant?.logo || '/images/engage-logo.svg';

  return (
    <div className="min-h-screen flex flex-col justify-center bg-gradient-to-br from-capstone-900 via-capstone-800 to-primary-900 py-12 px-4 sm:px-6 lg:px-8">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-600/20 rounded-full blur-3xl"></div>
      </div>

      <div className="relative sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <div className="flex items-center space-x-3">
            <img 
              src={logoUrl}
              alt={tenant?.name || 'Engage by Capstone'}
              className="h-16 w-auto"
            />
          </div>
          <p className="mt-4 text-center text-sm text-gray-300">
            Professional proposal generation for UK accountants
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white/95 backdrop-blur-lg py-8 px-4 shadow-2xl sm:rounded-2xl sm:px-10 border border-white/20">
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} Capstone. All rights reserved.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            MTD ITSA Ready &bull; UK Compliant &bull; Secure & Private
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
