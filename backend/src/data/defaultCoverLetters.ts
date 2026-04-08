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
    name: 'Professional',
    tone: CoverLetterTone.PROFESSIONAL,
    content: `Dear {{clientName}},

Thank you for considering {{tenantName}} for your accounting needs. We are pleased to present this comprehensive proposal for your review.

Based on our understanding of your business requirements, we have prepared a tailored service package that addresses your specific needs. This proposal includes {{serviceCount}} services designed to ensure your financial compliance and support your business growth.

**Monthly Investment:** {{monthlyTotal}}

Our team of qualified accountants brings extensive experience in helping businesses like yours achieve their financial goals while maintaining full compliance with UK regulations.

We would welcome the opportunity to discuss this proposal with you in more detail and answer any questions you may have.

Yours sincerely,

{{senderName}}
{{senderPosition}}`,
    isDefault: true,
    isSystem: true,
  },
  {
    name: 'Friendly',
    tone: CoverLetterTone.FRIENDLY,
    content: `Hi {{clientName}},

Great to connect with you! We're excited to put together this proposal for you.

We've taken a good look at what your business needs and think we've got the perfect package for you. This includes {{serviceCount}} services that'll keep you on track and give you peace of mind.

**Your monthly investment:** {{monthlyTotal}}

We love working with businesses like yours and helping them thrive. Our team is always here to chat if you have any questions - no question is too small!

Looking forward to working with you.

Best regards,

{{senderName}}
{{senderPosition}}`,
    isDefault: false,
    isSystem: true,
  },
  {
    name: 'Modern',
    tone: CoverLetterTone.MODERN,
    content: `{{clientName}},

Your accounting, simplified.

We've designed this proposal specifically for your business - {{serviceCount}} services, one monthly payment, zero hassle.

**{{monthlyTotal}}/month**

✓ Full UK compliance
✓ Dedicated account manager
✓ Cloud-based access
✓ Proactive tax planning

Ready to get started? Accept this proposal and we'll have you set up within 48 hours.

{{senderName}}
{{senderPosition}}`,
    isDefault: false,
    isSystem: true,
  },
];

/**
 * Available merge fields for cover letter templates
 */
export const coverLetterMergeFields = [
  { key: 'clientName', description: 'Client company name', example: 'ABC Ltd' },
  { key: 'tenantName', description: 'Your practice name', example: 'Capstone Accounting' },
  { key: 'serviceCount', description: 'Number of services in proposal', example: '5' },
  { key: 'monthlyTotal', description: 'Total monthly payment with VAT', example: '£450.00' },
  { key: 'senderName', description: 'Your full name', example: 'John Smith' },
  { key: 'senderPosition', description: 'Your job title', example: 'Senior Accountant' },
  { key: 'proposalReference', description: 'Proposal reference number', example: 'PROP-ABC123' },
  { key: 'proposalTitle', description: 'Proposal title', example: 'Annual Accounting Services' },
];

/**
 * Render a template with merge field data
 */
export function renderTemplate(template: string, data: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(data)) {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return rendered;
}

export default defaultCoverLetterTemplates;
