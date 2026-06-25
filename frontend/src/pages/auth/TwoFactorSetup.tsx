/**
 * Two-Factor Authentication — coming soon
 * Backend TOTP endpoints return 501 until fully implemented.
 */

import { Link } from 'react-router-dom';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

export const TwoFactorSetup = () => {
  return (
    <div className="max-w-lg mx-auto text-center py-12 px-4">
      <ShieldCheckIcon className="mx-auto h-12 w-12 text-primary-500" />
      <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">
        Two-factor authentication
      </h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400 leading-relaxed">
        We&apos;re finishing TOTP support for authenticator apps. Your account remains protected by
        secure cookies, CSRF protection, and session refresh until 2FA launches.
      </p>
      <Link to="/settings?tab=security" className="mt-8 inline-flex btn-primary">
        Back to security settings
      </Link>
    </div>
  );
};

export default TwoFactorSetup;
