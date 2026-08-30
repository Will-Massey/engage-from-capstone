export type CeStatus = 'In product' | 'Pipeline' | 'Ops' | 'Firm ISMS';

export type CeControl = {
  id: string;
  title: string;
  status: CeStatus;
  evidence: string;
  remaining: string;
  href?: string;
};

/** Official Cyber Essentials five technical controls — prep only, not a certificate. */
export const CE_CONTROLS: CeControl[] = [
  {
    id: 'CE1',
    title: 'Firewalls',
    status: 'In product',
    evidence:
      'TLS on the public edge; Postgres is not exposed; Helmet, CORS allow-list, and CSRF on the API.',
    remaining: 'Write the Cloudflare / Render boundary notes an assessor will ask for.',
    href: '/status',
  },
  {
    id: 'CE2',
    title: 'Secure configuration',
    status: 'In product',
    evidence:
      'Secrets in environment variables; CSP and HSTS; production admin DDL off; no hardcoded seed keys.',
    remaining: 'Firm laptop and admin-account hardening sit in the practice ISMS, not in Engage.',
  },
  {
    id: 'CE3',
    title: 'Security update management',
    status: 'Pipeline',
    evidence: 'Lockfiles, Dependabot, and production deploys from reviewed master only.',
    remaining: 'Name a patch SLA (critical vs routine) before the CE assessment.',
  },
  {
    id: 'CE4',
    title: 'User access control',
    status: 'In product',
    evidence: 'JWT, RBAC, MFA/TOTP, tenant isolation on every data path.',
    remaining: 'Joiner / leaver and unused-account review are firm process.',
    href: '/settings',
  },
  {
    id: 'CE5',
    title: 'Malware protection',
    status: 'Ops',
    evidence: 'Hosts are the managed Render / Cloudflare platforms.',
    remaining: 'Endpoint AV on practice devices is the firm’s control — document it in the ISMS.',
  },
];

export type ResidencyFact = {
  title: string;
  body: string;
  href?: string;
};

export const RESIDENCY_FACTS: ResidencyFact[] = [
  {
    title: 'UK controller',
    body: 'Capstone Software Ltd is a UK company. We act as processor for practice client data and as controller for account, billing, and platform admin data.',
    href: '/legal/privacy',
  },
  {
    title: 'UK-first product — not UK-only hosting',
    body: 'Engage is built for UK practices (UK English, MTD, Companies House). Hosting is Neon, Render, and Cloudflare. We do not claim every byte lives in the UK.',
  },
  {
    title: 'Transfers',
    body: 'Where data leaves the UK we use UK IDTA (or equivalent) and ICO transfer-risk assessment — see the privacy policy.',
    href: '/legal/privacy',
  },
  {
    title: 'Sub-processors',
    body: 'Render (app), Neon (Postgres), Cloudflare (edge and email), Stripe (payments), and xAI when Clara is enabled. Full list on request.',
    href: '/legal/privacy',
  },
];

export const SUB_PROCESSORS: Array<{ name: string; role: string; note: string }> = [
  { name: 'Render', role: 'Application hosting', note: 'Backend and frontend deploys' },
  { name: 'Neon', role: 'Postgres', note: 'Primary database — region recorded at cutover' },
  { name: 'Cloudflare', role: 'Edge + email', note: '/engage worker on capstonesoftware.co.uk' },
  { name: 'Stripe', role: 'Payments', note: 'We do not store full card numbers' },
  { name: 'xAI', role: 'Clara inference', note: 'Only when the practice has AI enabled' },
];

export function countCeRemaining(controls: CeControl[] = CE_CONTROLS): number {
  return controls.filter((c) => c.status !== 'In product').length;
}

export function buildDiligenceSummary(opts?: { remaining?: number }): string {
  const remaining = opts?.remaining ?? countCeRemaining();
  return `Engage by Capstone — Trust & UK residency summary

Entity: Capstone Software Ltd (UK), serving UK accountancy practices.
Product: Engage — proposal → e-sign → collect → practice delivery (jobs, mailbox, forms, automations).
Security: JWT + RBAC + MFA; tenant isolation; TLS; CSRF; encrypted secrets for OAuth.
Evidence in product:
• Forensic e-sign certificate (hash, IP, UA, consent) on proposal Audit tab
• Public status page
• Privacy, terms, AI disclosure, payment collection terms
Cyber Essentials: prep map in product — not a certificate. ${remaining} of the five technical controls still need ops or firm-ISMS evidence before assessment.
Residency: UK controller and UK-first product. Hosting is Neon + Render + Cloudflare. We do not claim UK-only data residency.
AccountFlow mesh: mock-default in practice builds; production AF never contacted until explicit cutover.

Contact: hello@capstonesoftware.co.uk
Subject: Engage trust pack / due diligence`;
}
