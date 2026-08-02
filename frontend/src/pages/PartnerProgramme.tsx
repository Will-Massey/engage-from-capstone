import { Link } from 'react-router-dom';
import {
  UserGroupIcon,
  SparklesIcon,
  CurrencyPoundIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import { BrandLogo } from '../components/ui/BrandLogo';

const benefits = [
  {
    icon: CurrencyPoundIcon,
    title: '20% referral commission',
    body: 'Earn recurring commission on every practice you refer that subscribes to Professional or Enterprise.',
    tone: 'mint' as const,
  },
  {
    icon: SparklesIcon,
    title: 'Co-branded onboarding',
    body: 'Your logo on the client journey — white-label portal and proposal links for Enterprise partners.',
    tone: 'sky' as const,
  },
  {
    icon: BuildingOffice2Icon,
    title: 'Agency sub-accounts',
    body: 'Manage multiple practices from one Enterprise parent account with consolidated reporting.',
    tone: 'violet' as const,
  },
  {
    icon: UserGroupIcon,
    title: 'Founding Practice pricing',
    body: 'Lock in £79/month Professional for 12 months for practices you onboard in the first 20 slots.',
    tone: 'amber' as const,
  },
];

export default function PartnerProgramme() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 pb-12">
      <header className="metal-tile metal-tile--mint p-6">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="metal-kicker">Partners</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
              Partner programme
            </h1>
            <p className="mt-2 max-w-lg text-sm text-slate-600 dark:text-slate-300">
              Refer practices, earn commission, and co-brand the Engage journey — independent of
              TaxCalc distribution.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/switch-from-engager" className="btn-primary text-sm">
                Partner battle card
              </Link>
              <Link to="/trust" className="btn-secondary text-sm">
                Trust pack
              </Link>
              <Link to="/proposals/wizard" className="btn-ghost text-sm">
                Demo: proposal wizard
              </Link>
            </div>
          </div>
          <BrandLogo className="h-20 w-auto object-contain" />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {benefits.map((b) => (
          <div key={b.title} className={`metal-tile metal-tile--${b.tone} p-5`}>
            <span className="metal-specular" aria-hidden />
            <div className="relative z-[1]">
              <b.icon className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              <h2 className="mt-3 font-semibold text-slate-900 dark:text-white">{b.title}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{b.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="metal-tile flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <span className="metal-specular" aria-hidden />
        <div className="relative z-[1]">
          <h2 className="font-semibold text-slate-900 dark:text-white">Ready to partner?</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Contact Capstone to register as a referral partner or agency reseller.
          </p>
        </div>
        <a
          href="mailto:hello@capstonesoftware.co.uk?subject=Engage%20Partner%20Programme"
          className="btn-accent relative z-[1] text-center"
        >
          Get in touch
        </a>
      </div>

      <p className="text-center text-sm text-slate-500">
        Switching a firm off Engager?{' '}
        <Link to="/switch-from-engager" className="text-emerald-700 hover:underline dark:text-emerald-400">
          Open the battle card &amp; ROI tool
        </Link>
        {' · '}
        <Link to="/clients/import" className="text-emerald-700 hover:underline dark:text-emerald-400">
          Import their clients
        </Link>
      </p>
    </div>
  );
}
