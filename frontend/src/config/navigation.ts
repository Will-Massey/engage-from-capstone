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

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ name: 'Dashboard', href: '/', icon: HomeIcon, matchPrefix: false }],
  },
  {
    id: 'work',
    label: 'Your work',
    items: [
      {
        name: 'Proposals',
        href: '/proposals',
        icon: DocumentTextIcon,
        description: 'Create and send engagement letters',
        matchPrefix: true,
      },
      {
        name: 'Clients',
        href: '/clients',
        icon: UsersIcon,
        description: 'Client records and MTD ITSA',
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
        name: 'Pricing calculator',
        href: '/pricing-calculator',
        icon: CalculatorIcon,
        description: 'Turnover and complexity → suggested fee bands',
        matchPrefix: false,
      },
      {
        name: 'Templates',
        href: '/templates',
        icon: RectangleStackIcon,
        description: 'Pre-made proposal bundles for faster drafting',
        matchPrefix: true,
      },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [{ name: 'Analytics', href: '/analytics', icon: ChartPieIcon, matchPrefix: true }],
  },
  {
    id: 'account',
    label: 'Account',
    items: [{ name: 'Settings', href: '/settings', icon: CogIcon, matchPrefix: true }],
  },
];

export const PRIMARY_CREATE = {
  label: 'New proposal',
  href: '/proposals/new',
  shortcut: '⌘K then N',
};

/** Flat list for command palette / search */
export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') {
    return pathname === '/';
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
