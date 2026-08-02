import type { ComponentType, SVGProps } from 'react';
import {
  HomeIcon,
  DocumentTextIcon,
  UsersIcon,
  WrenchScrewdriverIcon,
  CalculatorIcon,
  RectangleStackIcon,
  ChartPieIcon,
  CogIcon,
  BriefcaseIcon,
  DocumentDuplicateIcon,
  BoltIcon,
  ArrowsRightLeftIcon,
  ScaleIcon,
  ShieldCheckIcon,
  InboxIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface NavItem {
  name: string;
  href: string;
  icon: NavIcon;
  description?: string;
  /** Highlight when pathname starts with href (e.g. /proposals/abc) */
  matchPrefix?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * Nav IA (path simplification):
 * 1) Today — daily delivery loop (fewest clicks)
 * 2) Win work — proposals
 * 3) Run practice — secondary ops
 * 4) Catalogue / Insights / Account
 * Grow (GTM) is demoted so it never competes with delivery.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'today',
    label: 'Today',
    items: [
      { name: 'Home', href: '/', icon: HomeIcon, matchPrefix: false },
      {
        name: 'Jobs',
        href: '/jobs',
        icon: BriefcaseIcon,
        description: 'Delivery board — phases, deadlines, time',
        matchPrefix: true,
      },
      {
        name: 'Inbox',
        href: '/inbox',
        icon: InboxIcon,
        description: 'Two-way mailbox, SMS, portal messages',
        matchPrefix: true,
      },
      {
        name: 'Clients',
        href: '/clients',
        icon: UsersIcon,
        description: 'Client records, portal, MTD ITSA',
        matchPrefix: true,
      },
    ],
  },
  {
    id: 'win',
    label: 'Win work',
    items: [
      {
        name: 'Proposals',
        href: '/proposals',
        icon: DocumentTextIcon,
        description: 'Create and send engagement letters',
        matchPrefix: true,
      },
    ],
  },
  {
    id: 'practice',
    label: 'Run practice',
    items: [
      {
        name: 'Workload',
        href: '/jobs/workload',
        icon: UsersIcon,
        description: 'Open jobs and overdue by team member',
        matchPrefix: false,
      },
      {
        name: 'Forms',
        href: '/forms',
        icon: ClipboardDocumentListIcon,
        description: 'Bulk questionnaires assigned to clients',
        matchPrefix: true,
      },
      {
        name: 'Letters',
        href: '/letters',
        icon: DocumentDuplicateIcon,
        description: 'Disengagement, clearance, HMRC 64-8',
        matchPrefix: true,
      },
      {
        name: 'Automations',
        href: '/automations',
        icon: BoltIcon,
        description: 'Chase packs, proposal follow-ups, schedules',
        matchPrefix: true,
      },
      {
        name: 'Integrations',
        href: '/integrations',
        icon: ArrowsRightLeftIcon,
        description: 'Xero, QuickBooks, AccountFlow mesh',
        matchPrefix: true,
      },
    ],
  },
  {
    id: 'catalogue',
    label: 'Catalogue',
    items: [
      {
        name: 'Services',
        href: '/services',
        icon: WrenchScrewdriverIcon,
        description: 'Fees and service templates',
        matchPrefix: true,
      },
      {
        name: 'Templates',
        href: '/templates',
        icon: RectangleStackIcon,
        description: 'Pre-made proposal bundles',
        matchPrefix: true,
      },
      {
        name: 'Pricing',
        href: '/pricing-calculator',
        icon: CalculatorIcon,
        description: 'Turnover → fee bands',
        matchPrefix: false,
      },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [{ name: 'Analytics', href: '/analytics', icon: ChartPieIcon, matchPrefix: true }],
  },
  {
    id: 'gtm',
    label: 'Partner demo',
    items: [
      {
        name: 'Switch from Engager',
        href: '/switch-from-engager',
        icon: ScaleIcon,
        description: 'Battle card · ROI · demo script',
        matchPrefix: false,
      },
      {
        name: 'Trust pack',
        href: '/trust',
        icon: ShieldCheckIcon,
        description: 'CE prep · UK residency · diligence',
        matchPrefix: false,
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [{ name: 'Settings', href: '/settings', icon: CogIcon, matchPrefix: true }],
  },
];

/** Primary create path — guided wizard (fewest steps to value) */
export const PRIMARY_CREATE = {
  label: 'New proposal',
  href: '/proposals/wizard',
  shortcut: 'Ctrl+K',
};

/** Flat list for command palette / search */
export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') {
    return pathname === '/';
  }
  // Jobs board should not stay active on Workload (sibling under /jobs/*)
  if (item.href === '/jobs' && pathname.startsWith('/jobs/workload')) {
    return false;
  }
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}

export function getPageMeta(pathname: string): {
  title?: string;
  description?: string;
  breadcrumbs: { label: string; href?: string }[];
  backTo?: { label: string; href: string };
} {
  if (pathname === '/') {
    return { title: 'Dashboard', breadcrumbs: [{ label: 'Dashboard' }] };
  }

  if (pathname === '/proposals') {
    return {
      title: 'Proposals',
      description: 'Create, send, and track engagement letters',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Proposals' }],
    };
  }
  if (pathname === '/proposals/new') {
    return {
      title: 'Create proposal',
      description: 'Build a proposal from your service catalogue',
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Proposals', href: '/proposals' },
        { label: 'New' },
      ],
      backTo: { label: 'Back to proposals', href: '/proposals' },
    };
  }
  if (pathname === '/proposals/wizard') {
    return {
      title: 'Create proposal',
      description: 'A guided flow from client to signed engagement — review every step',
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Proposals', href: '/proposals' },
        { label: 'Guided' },
      ],
      backTo: { label: 'Back to proposals', href: '/proposals' },
    };
  }
  if (pathname === '/proposals/renewals') {
    return {
      title: 'Bulk renewals',
      description: 'Create draft renewal proposals for multiple clients at once',
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Proposals', href: '/proposals' },
        { label: 'Bulk renewals' },
      ],
      backTo: { label: 'Back to proposals', href: '/proposals' },
    };
  }
  if (pathname.startsWith('/proposals/') && pathname.endsWith('/edit')) {
    const proposalId = pathname.split('/')[2];
    return {
      title: 'Edit proposal',
      description: 'Update services, pricing, and cover letter',
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Proposals', href: '/proposals' },
        { label: 'Edit' },
      ],
      backTo: { label: 'Back to proposal', href: `/proposals/${proposalId}` },
    };
  }
  if (pathname.startsWith('/proposals/')) {
    // Detail page renders its own rich header (title, status, actions), so the
    // route header contributes breadcrumbs + back link only.
    return {
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Proposals', href: '/proposals' },
        { label: 'Details' },
      ],
      backTo: { label: 'Back to proposals', href: '/proposals' },
    };
  }

  if (pathname === '/switch-from-engager') {
    return {
      title: 'Switch from Engager',
      description: 'Battle card and ROI calculator',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Switch from Engager' }],
    };
  }
  if (pathname === '/trust') {
    return {
      title: 'Trust pack',
      description: 'Cyber Essentials prep and UK residency',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Trust' }],
    };
  }

  if (pathname === '/jobs') {
    return {
      title: 'Jobs',
      description: 'Delivery board for accepted engagements',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Jobs' }],
    };
  }
  if (pathname === '/jobs/workload') {
    return {
      title: 'Workload',
      description: 'Balance open jobs across the team',
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Jobs', href: '/jobs' },
        { label: 'Workload' },
      ],
      backTo: { label: 'Back to jobs', href: '/jobs' },
    };
  }
  if (pathname === '/letters' || pathname.startsWith('/letters/')) {
    return {
      title: 'Practice letters',
      description: 'Disengagement, professional clearance, HMRC 64-8',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Letters' }],
    };
  }
  if (pathname === '/inbox' || pathname.startsWith('/inbox/')) {
    return {
      title: 'Inbox',
      description: 'Two-way mailbox + activity timeline',
      breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Inbox' }],
    };
  }
  if (pathname === '/forms' || pathname.startsWith('/forms/')) {
    return {
      title: 'Forms',
      description: 'Bulk questionnaires for clients',
      breadcrumbs: [{ label: 'Home', href: '/' }, { label: 'Forms' }],
    };
  }
  if (pathname === '/automations' || pathname.startsWith('/automations/')) {
    return {
      title: 'Automations',
      description: 'Chase packs and proposal follow-ups',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Automations' }],
    };
  }
  if (pathname.startsWith('/integrations/accountflow')) {
    return {
      title: 'AccountFlow mesh',
      description: 'Sandbox linkage — production AccountFlow not contacted',
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'AccountFlow mesh' },
      ],
    };
  }
  if (pathname.startsWith('/jobs/')) {
    return {
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Jobs', href: '/jobs' },
        { label: 'Details' },
      ],
      backTo: { label: 'Back to jobs', href: '/jobs' },
    };
  }

  if (pathname === '/clients') {
    return {
      title: 'Clients',
      description: 'Client records, Companies House data, and MTD ITSA status',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Clients' }],
    };
  }
  if (pathname === '/clients/new') {
    return {
      title: 'Add client',
      description: 'Add a new client to your practice',
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: 'New' },
      ],
      backTo: { label: 'Back to clients', href: '/clients' },
    };
  }
  if (pathname.startsWith('/clients/')) {
    // Detail page renders its own rich header (client name, actions), so the
    // route header contributes breadcrumbs + back link only.
    return {
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Clients', href: '/clients' },
        { label: 'Details' },
      ],
      backTo: { label: 'Back to clients', href: '/clients' },
    };
  }

  if (pathname === '/services') {
    return {
      title: 'Services',
      description: 'Fees, templates, and pricing for your proposals',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Services' }],
    };
  }
  if (pathname === '/pricing-calculator') {
    return {
      title: 'Pricing calculator',
      description: 'Value-based fee suggestions from client turnover and complexity',
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Services', href: '/services' },
        { label: 'Pricing calculator' },
      ],
      backTo: { label: 'Back to services', href: '/services' },
    };
  }
  if (pathname.startsWith('/services/')) {
    // Detail page renders its own rich header (service name, actions), so the
    // route header contributes breadcrumbs + back link only.
    return {
      breadcrumbs: [
        { label: 'Dashboard', href: '/' },
        { label: 'Services', href: '/services' },
        { label: 'Details' },
      ],
      backTo: { label: 'Back to services', href: '/services' },
    };
  }

  if (pathname === '/templates') {
    return {
      title: 'Proposal Templates',
      description:
        'Ready-made ICAEW and ACCA service bundles, plus your own custom templates — nothing is replaced when you add one',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Templates' }],
    };
  }

  if (pathname === '/analytics') {
    return {
      title: 'Analytics',
      description: 'Proposal performance, revenue, and conversion trends',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Analytics' }],
    };
  }
  if (pathname === '/settings') {
    return {
      title: 'Settings',
      description: 'Manage your account, practice details, and preferences',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Settings' }],
    };
  }
  if (pathname === '/subscription') {
    return {
      title: 'Platform subscription',
      description:
        'Your practice’s monthly platform plan — client proposal payments are handled separately',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Subscription' }],
    };
  }
  if (pathname === '/partners') {
    return {
      title: 'Partner programme',
      description:
        'Refer UK accountancy firms to Engage and earn recurring commission — ideal for resellers, networks, and consultants',
      breadcrumbs: [{ label: 'Dashboard', href: '/' }, { label: 'Partner programme' }],
    };
  }

  return { title: 'Engage', breadcrumbs: [{ label: 'Dashboard', href: '/' }] };
}
