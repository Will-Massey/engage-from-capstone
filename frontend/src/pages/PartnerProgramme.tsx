import { Link } from 'react-router-dom';
import { UserGroupIcon, SparklesIcon, CurrencyPoundIcon, BuildingOffice2Icon } from '@heroicons/react/24/outline';

const benefits = [
  {
    icon: CurrencyPoundIcon,
    title: '20% referral commission',
    body: 'Earn recurring commission on every practice you refer that subscribes to Professional or Enterprise.',
  },
  {
    icon: SparklesIcon,
    title: 'Co-branded onboarding',
    body: 'Your logo on the client journey — white-label portal and proposal links for Enterprise partners.',
  },
  {
    icon: BuildingOffice2Icon,
    title: 'Agency sub-accounts',
    body: 'Manage multiple practices from one Enterprise parent account with consolidated reporting.',
  },
  {
    icon: UserGroupIcon,
    title: 'Founding Practice pricing',
    body: 'Lock in £79/month Professional for 12 months for practices you onboard in the first 20 slots.',
  },
];

export default function PartnerProgramme() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-primary-600 uppercase tracking-wide">Engage Partner Programme</p>
        <h1 className="text-3xl font-bold text-slate-900 mt-2">Grow with UK practices</h1>
        <p className="text-slate-600 mt-3 max-w-2xl">
          Refer accountancy firms to Engage and earn recurring commission. Ideal for software resellers,
          networks, and consultants serving UK practices.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-10">
        {benefits.map((b) => (
          <div key={b.title} className="glass-tile p-5">
            <b.icon className="h-8 w-8 text-primary-600 mb-3" />
            <h2 className="font-semibold text-slate-900">{b.title}</h2>
            <p className="text-sm text-slate-600 mt-2">{b.body}</p>
          </div>
        ))}
      </div>

      <div className="glass-tile p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-900">Ready to partner?</h2>
          <p className="text-sm text-slate-600 mt-1">
            Contact Capstone to register as a referral partner or agency reseller.
          </p>
        </div>
        <a
          href="mailto:hello@capstonesoftware.co.uk?subject=Engage%20Partner%20Programme"
          className="btn-primary text-center"
        >
          Get in touch
        </a>
      </div>

      <p className="text-sm text-slate-500 mt-6">
        Already a partner?{' '}
        <Link to="/settings" className="text-primary-600 hover:underline">
          Manage agency sub-accounts in Settings
        </Link>
      </p>
    </div>
  );
}