/**
 * Default Cover Letter Templates
 * Pre-designed templates for new tenants
 */

import { CoverLetterTone } from '@prisma/client';

export interface DefaultTemplate {
  name: string;
  tone: CoverLetterTone;
  content: string;
  isDefault: boolean;
  isSystem: boolean;
}

export const defaultCoverLetterTemplates: DefaultTemplate[] = [
  {
    name: 'Traditional & Formal',
    tone: CoverLetterTone.PROFESSIONAL,
    content: `Dear {{clientName}},

Thank you for the opportunity to present this proposal for {{servicesSummary}} to {{companyName}}. Following our discussion on {{discussionDate}}, we have set out below the scope of work, fee structure, and terms under which we would be pleased to act on your behalf.

{{tenantName}} has {{firmExperience}} of experience supporting businesses in {{sectorOrRegion}}, and we believe the approach outlined in this proposal reflects both the requirements you described and the standards we hold ourselves to as a {{firmCredentials}} practice.

We would welcome the opportunity to discuss this proposal further at your convenience, and to answer any questions you may have before proceeding.

Yours sincerely,

{{senderName}}

{{senderPosition}}, {{tenantName}}`,
    isDefault: true,
    isSystem: true,
  },
  {
    name: 'Warm & Personable',
    tone: CoverLetterTone.FRIENDLY,
    content: `Hi {{clientName}},

It was great speaking with you about {{companyName}} — it's clear you've built something you care about, and I wanted to put together something that actually reflects what you need rather than a generic package.

Attached is our proposal for {{servicesSummary}}. I've tried to keep it straightforward: what we'll do, what it costs, and what you can expect from us month to month. No surprises, no jargon you don't need.

If anything doesn't make sense, or you want to talk through any of it, just call or drop me a message — happy to go through it together.

Best,

{{senderName}}

{{tenantName}}`,
    isDefault: false,
    isSystem: true,
  },
  {
    name: 'Modern, Direct & Confident',
    tone: CoverLetterTone.MODERN,
    content: `{{clientName}},

Based on what you've told us about {{companyName}}, here's what we'd recommend and what it would look like working with us.

The short version: {{servicesSummary}}. Full detail, pricing, and timelines are in the attached proposal.

We're confident this gets you {{keyOutcome}}. If you want to move forward, the next step is below — if you've got questions first, let's talk this week.

{{senderName}}

{{tenantName}}`,
    isDefault: false,
    isSystem: true,
  },
];

/**
 * Available merge fields for cover letter templates
 * These are autofilled where possible in the proposal builder and when rendering.
 */
export const coverLetterMergeFields = [
  { key: 'clientName', description: 'Addressee / contact name (preferred for salutation)', example: 'Alex Rivera' },
  { key: 'companyName', description: 'Client company or trading name', example: 'Rivera & Co Ltd' },
  { key: 'servicesSummary', description: 'Short natural language list of services', example: 'monthly bookkeeping, VAT compliance and annual accounts' },
  { key: 'discussionDate', description: 'Date or reference to your conversation', example: '12 June 2026' },
  { key: 'tenantName', description: 'Your practice / firm name', example: 'Capstone Accounting' },
  { key: 'firmExperience', description: 'Years or description of firm experience', example: 'over 25 years' },
  { key: 'sectorOrRegion', description: 'Sector or region you serve', example: 'the Midlands' },
  { key: 'firmCredentials', description: 'Regulatory or professional status', example: 'ICAEW-regulated' },
  { key: 'keyOutcome', description: 'Primary benefit / outcome (for direct tone)', example: 'compliant and ahead of MTD ITSA deadlines' },
  { key: 'senderName', description: 'Sender full name', example: 'Jordan Hale' },
  { key: 'senderPosition', description: 'Sender job title', example: 'Partner' },
  { key: 'monthlyTotal', description: 'Recurring monthly cost (inc VAT) if relevant', example: '£712' },
  { key: 'serviceCount', description: 'Number of services', example: '4' },
  { key: 'proposalReference', description: 'Proposal reference', example: 'PROP-2026-0842' },
  { key: 'proposalTitle', description: 'Proposal title', example: 'Annual Compliance & Advisory' },
];

/**
 * Render a template with merge field data.
 * Supports aliases and falls back gracefully for missing values.
 */
export function renderTemplate(template: string, data: Record<string, string | undefined>): string {
  let rendered = template;

  const aliases: Record<string, string[]> = {
    clientName: ['clientName', 'client', 'contactName'],
    companyName: ['companyName', 'clientCompany', 'businessName'],
    servicesSummary: ['servicesSummary', 'services', 'serviceList'],
    discussionDate: ['discussionDate', 'date', 'meetingDate'],
    tenantName: ['tenantName', 'firmName', 'practiceName'],
    senderName: ['senderName', 'name'],
    senderPosition: ['senderPosition', 'title', 'senderTitle', 'position'],
    firmExperience: ['firmExperience', 'experience', 'yearsExperience'],
    sectorOrRegion: ['sectorOrRegion', 'sector', 'region'],
    firmCredentials: ['firmCredentials', 'credentials', 'regulated'],
    keyOutcome: ['keyOutcome', 'outcome', 'benefit'],
  };

  // Build a lookup with aliases
  const lookup: Record<string, string> = {};
  for (const [rawKey, val] of Object.entries(data)) {
    if (val == null) continue;
    lookup[rawKey] = val;
    // also index lower
    lookup[rawKey.toLowerCase()] = val;
  }

  // Replace all {{key}} occurrences, trying aliases
  rendered = rendered.replace(/\{\{([^}]+)\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim();
    if (lookup[key] != null) return lookup[key];
    const lower = key.toLowerCase();
    if (lookup[lower] != null) return lookup[lower];

    // Try alias groups
    for (const [canonical, list] of Object.entries(aliases)) {
      if (list.includes(key) || list.includes(lower)) {
        if (lookup[canonical] != null) return lookup[canonical];
        for (const a of list) {
          if (lookup[a] != null) return lookup[a];
        }
      }
    }
    return ''; // unknown or missing -> remove token cleanly
  });

  // Clean up any double spaces or awkward punctuation left by empties
  rendered = rendered.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return rendered;
}

export default defaultCoverLetterTemplates;
