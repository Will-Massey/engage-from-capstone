/**
 * W3.2 — ICAEW/ACCA-aligned proposal template packages (100+ definitions).
 * Resolved to tenant ServiceTemplate IDs at seed time by service name.
 */
import {
  allServices,
  advisoryServices,
  bookkeepingServices,
  complianceServices,
  mtditsaServices,
  specialistServices,
} from './ukAccountancyServices.js';

export interface ProposalTemplatePackageDef {
  name: string;
  description: string;
  title: string;
  targetEntityType: string;
  targetIndustry?: string;
  serviceNames: string[];
  coverLetterSnippet?: string;
}

const ENTITY_TYPES = [
  'LIMITED_COMPANY',
  'LLP',
  'SOLE_TRADER',
  'PARTNERSHIP',
  'CHARITY',
  'NON_PROFIT',
] as const;

const INDUSTRIES = [
  'General',
  'Retail & e-commerce',
  'Construction',
  'Professional services',
  'Property & lettings',
  'Hospitality',
  'Technology',
  'Healthcare',
  'Manufacturing',
  'Agriculture',
] as const;

const TIERS = ['Micro', 'Small', 'Standard', 'Growth', 'Premium'] as const;

/**
 * Foundation catalogue only — the original W3.2 services. Generated bundle and
 * industry packages are pinned to this pool so their compositions never change
 * when new services are appended (existing library entries stay byte-identical;
 * tenants dedupe seeded templates by name). New R4.3 services are covered by the
 * generated single-service templates and the curated packages below.
 */
const foundationServices = [
  ...complianceServices,
  ...advisoryServices,
  ...mtditsaServices,
  ...specialistServices,
  ...bookkeepingServices,
];

function filterForEntity(pool: typeof allServices, entityType: string): typeof allServices {
  return pool.filter(
    (s) =>
      !s.applicableEntityTypes?.length ||
      s.applicableEntityTypes.includes(entityType) ||
      s.applicableEntityTypes.includes('ALL')
  );
}

function servicesForEntity(entityType: string): typeof allServices {
  return filterForEntity(allServices, entityType);
}

function foundationServicesForEntity(entityType: string): typeof allServices {
  return filterForEntity(foundationServices, entityType);
}

function entityLabel(entity: string): string {
  return entity
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Single-service templates per entity (where applicable). */
function buildSingleServiceTemplates(): ProposalTemplatePackageDef[] {
  const out: ProposalTemplatePackageDef[] = [];
  for (const entity of ENTITY_TYPES) {
    const applicable = servicesForEntity(entity);
    for (const svc of applicable) {
      out.push({
        name: `${svc.name} — ${entityLabel(entity)}`,
        description: `${svc.category} package for ${entityLabel(entity)} clients`,
        title: `${svc.name} proposal`,
        targetEntityType: entity,
        serviceNames: [svc.name],
        coverLetterSnippet: `We are pleased to set out our fees for ${svc.name.toLowerCase()} for your business.`,
      });
    }
  }
  return out;
}

/** Multi-service bundles by category + entity + tier. */
function buildBundleTemplates(): ProposalTemplatePackageDef[] {
  const out: ProposalTemplatePackageDef[] = [];
  const categories = ['COMPLIANCE', 'ADVISORY', 'MTD_ITSA', 'BOOKKEEPING', 'SPECIALIST'] as const;

  for (const entity of ENTITY_TYPES) {
    const applicable = foundationServicesForEntity(entity);
    for (const category of categories) {
      const inCat = applicable.filter((s) => s.category === category);
      if (inCat.length < 2) continue;

      for (const tier of TIERS) {
        const count =
          tier === 'Micro'
            ? 2
            : tier === 'Small'
              ? 3
              : tier === 'Standard'
                ? 4
                : tier === 'Growth'
                  ? 5
                  : 6;
        const picked = inCat.slice(0, Math.min(count, inCat.length));
        out.push({
          name: `${entityLabel(entity)} ${category.replace('_', ' ')} — ${tier}`,
          description: `${tier}-tier ${category.toLowerCase()} bundle for ${entityLabel(entity)}`,
          title: `${tier} ${category.replace('_', ' ')} engagement`,
          targetEntityType: entity,
          serviceNames: picked.map((s) => s.name),
        });
      }
    }
  }
  return out;
}

/** Industry-flavoured compliance starters (ICAEW/ACCA practice norms). */
function buildIndustryTemplates(): ProposalTemplatePackageDef[] {
  const out: ProposalTemplatePackageDef[] = [];
  const complianceNames = foundationServices
    .filter((s) => s.category === 'COMPLIANCE')
    .map((s) => s.name)
    .slice(0, 4);

  if (!complianceNames.length) return out;

  for (const industry of INDUSTRIES) {
    for (const entity of ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP'] as const) {
      const applicable = foundationServicesForEntity(entity).filter((s) =>
        complianceNames.includes(s.name)
      );
      if (!applicable.length) continue;
      out.push({
        name: `${industry} — ${entityLabel(entity)} compliance starter`,
        description: `ICAEW/ACCA-aligned starter pack for ${industry.toLowerCase()} ${entityLabel(entity)} clients`,
        title: `Compliance proposal — ${industry}`,
        targetEntityType: entity,
        targetIndustry: industry,
        serviceNames: applicable.slice(0, 3).map((s) => s.name),
        coverLetterSnippet: `This proposal is tailored for ${industry.toLowerCase()} businesses and reflects typical UK practice fee structures.`,
      });
    }
  }
  return out;
}

/**
 * R4.3 — Curated UK practice service-matrix packages.
 * Hand-picked combinations covering the standard service mix a new practice
 * expects to find ready-made: compliance bundles, sector packs, and specialist
 * engagements across every entity type. Service names must match the catalogue
 * in ukAccountancyServices exactly — resolution at seed time is by name.
 */
function buildCuratedPracticePackages(): ProposalTemplatePackageDef[] {
  return [
    // ---- Limited company ----
    {
      name: 'Limited Company Essentials — Accounts, CT600 & Confirmation Statement',
      description: 'Core annual compliance bundle for limited companies',
      title: 'Annual compliance engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
        'Confirmation Statement (CS01)',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your company’s core annual compliance: statutory accounts, corporation tax return, and confirmation statement.',
    },
    {
      name: 'Limited Company Essentials with VAT',
      description: 'Annual compliance bundle with quarterly VAT returns',
      title: 'Compliance & VAT engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
        'Confirmation Statement (CS01)',
        'VAT Return Preparation',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your company’s annual compliance together with MTD-compliant VAT return preparation.',
    },
    {
      name: 'Limited Company Complete — Compliance, Payroll & Bookkeeping',
      description: 'Full-service package: compliance, VAT, payroll, and bookkeeping',
      title: 'Complete outsourced compliance engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
        'Confirmation Statement (CS01)',
        'VAT Return Preparation',
        'Monthly Payroll Processing',
        'Full Bookkeeping Service',
      ],
      coverLetterSnippet:
        'This proposal covers a complete outsourced finance function for your company: bookkeeping, payroll, VAT, and all annual filings handled by one team.',
    },
    {
      name: 'Micro-Entity Starter — FRS 105 Accounts & CT600',
      description: 'Entry-level compliance for micro companies under FRS 105',
      title: 'Micro-entity compliance engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Micro-Entity Accounts (FRS 105)',
        'CT600 Corporation Tax Return',
        'Confirmation Statement (CS01)',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for micro-entity accounts preparation under FRS 105 together with your corporation tax return and confirmation statement.',
    },
    {
      name: 'Dormant Company Package',
      description: 'Minimal filings for dormant companies',
      title: 'Dormant company engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: ['Dormant Company Accounts', 'Confirmation Statement (CS01)'],
      coverLetterSnippet:
        'We are pleased to set out our fees for keeping your dormant company compliant with Companies House at minimal cost.',
    },
    {
      name: 'Director & Company Combined — Accounts, CT600 & Personal Tax',
      description: 'Company compliance plus the director’s personal tax return',
      title: 'Company & director engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
        'Personal Tax Return (SA100)',
      ],
      coverLetterSnippet:
        'This proposal covers both your company’s annual compliance and your personal self-assessment tax return, so nothing falls between the two.',
    },
    {
      name: 'Contractor Package — Accounts, CT600, VAT & IR35 Review',
      description: 'Compliance package for contractors with an annual IR35 status review',
      title: 'Contractor engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
        'VAT Return Preparation',
        'IR35 & Off-Payroll Working Review',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your contractor company’s compliance, including an annual review of your engagements against the off-payroll working rules.',
    },
    {
      name: 'Startup Package — Formation, Accounts & Digital Bookkeeping',
      description: 'Incorporation, first-year compliance, and cloud bookkeeping setup',
      title: 'New business engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Company Formation & Startup Support',
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
        'Digital Bookkeeping Setup',
      ],
      coverLetterSnippet:
        'Congratulations on starting your new business. This proposal covers incorporation, your first-year filings, and getting your records set up properly from day one.',
    },
    {
      name: 'Company Payroll Complete — Payroll, Auto-Enrolment & P11D',
      description: 'Full payroll service including pension duties and benefits reporting',
      title: 'Payroll & pensions engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Monthly Payroll Processing',
        'Auto-Enrolment Pension Administration',
        'P11D Benefits Reporting',
        'Payroll Year-End Processing',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for a complete payroll service covering RTI submissions, auto-enrolment pension duties, benefits reporting, and year-end.',
    },
    {
      name: 'R&D Claim Package — CT600 & R&D Tax Credit',
      description: 'Corporation tax return with R&D tax relief claim',
      title: 'R&D tax relief engagement',
      targetEntityType: 'LIMITED_COMPANY',
      targetIndustry: 'Technology',
      serviceNames: ['CT600 Corporation Tax Return', 'R&D Tax Credit Claim'],
      coverLetterSnippet:
        'We are pleased to set out our fees for preparing your corporation tax return alongside a fully documented R&D tax relief claim.',
    },
    {
      name: 'Capital Allowances Package — Review & CT600',
      description: 'Capital allowances optimisation with the corporation tax return',
      title: 'Capital allowances engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: ['Capital Allowances Review', 'CT600 Corporation Tax Return'],
      coverLetterSnippet:
        'This proposal covers a detailed capital allowances review so qualifying expenditure is fully claimed through your corporation tax return.',
    },
    {
      name: 'Investment Ready — EIS/SEIS & Company Compliance',
      description: 'EIS/SEIS scheme support alongside core company compliance',
      title: 'Investment readiness engagement',
      targetEntityType: 'LIMITED_COMPANY',
      targetIndustry: 'Technology',
      serviceNames: [
        'EIS & SEIS Scheme Support',
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
      ],
      coverLetterSnippet:
        'This proposal supports your fundraising with EIS/SEIS advance assurance and compliance statements, alongside your company’s annual filings.',
    },
    {
      name: 'Audit & Accounts Package',
      description: 'Statutory audit with accounts and corporation tax preparation',
      title: 'Audit & accounts engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Statutory Audit',
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your statutory audit together with accounts preparation and the corporation tax return.',
    },
    {
      name: 'Growth Advisory — Management Accounts, Cash Flow & Virtual FD',
      description: 'Advisory package for growing companies wanting board-level support',
      title: 'Growth advisory engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: ['Management Accounts', 'Cash Flow Forecasting', 'Virtual Finance Director'],
      coverLetterSnippet:
        'This proposal gives you board-level financial support: regular management accounts, rolling cash flow forecasts, and a retained virtual finance director.',
    },
    {
      name: 'Property SPV — Accounts, CT600 & Company Secretarial',
      description: 'Compliance package for property special purpose vehicles',
      title: 'Property company engagement',
      targetEntityType: 'LIMITED_COMPANY',
      targetIndustry: 'Property & lettings',
      serviceNames: [
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
        'Confirmation Statement (CS01)',
        'Company Secretarial Service',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your property company’s annual compliance, including company secretarial support and registered office service.',
    },
    {
      name: 'Company Crypto Tax — Reporting & CT600',
      description: 'Cryptoasset reporting alongside the corporation tax return',
      title: 'Cryptoasset tax engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: ['Cryptoasset Tax Reporting', 'CT600 Corporation Tax Return'],
      coverLetterSnippet:
        'This proposal covers the review and reporting of your company’s cryptoasset transactions in line with HMRC guidance, alongside your corporation tax return.',
    },
    {
      name: 'CIS Contractor Company — CIS Returns, Payroll & Accounts',
      description: 'Construction contractor package: CIS, payroll, and annual compliance',
      title: 'CIS contractor engagement',
      targetEntityType: 'LIMITED_COMPANY',
      targetIndustry: 'Construction',
      serviceNames: [
        'CIS Monthly Return',
        'Monthly Payroll Processing',
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your construction company: monthly CIS returns, payroll, and full annual compliance handled together.',
    },
    {
      name: 'Exit Ready — Succession & Personal Tax Planning',
      description: 'Exit planning with a personal tax efficiency review',
      title: 'Exit planning engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: ['Exit & Succession Planning', 'Personal Tax Planning Review'],
      coverLetterSnippet:
        'This proposal covers structured exit and succession planning for your business, alongside a review of your personal tax position ahead of any disposal.',
    },
    {
      name: 'Company Peace of Mind — Compliance & Fee Protection',
      description: 'Annual compliance with tax investigation fee protection',
      title: 'Compliance & protection engagement',
      targetEntityType: 'LIMITED_COMPANY',
      serviceNames: [
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
        'Confirmation Statement (CS01)',
        'Tax Investigation Fee Protection',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your company’s annual compliance, with fee protection included should HMRC open an enquiry.',
    },
    {
      name: 'E-commerce Company — Accounts, VAT & Bookkeeping',
      description: 'Online retail package with VAT and full bookkeeping',
      title: 'E-commerce engagement',
      targetEntityType: 'LIMITED_COMPANY',
      targetIndustry: 'Retail & e-commerce',
      serviceNames: [
        'Statutory Annual Accounts',
        'CT600 Corporation Tax Return',
        'VAT Return Preparation',
        'Full Bookkeeping Service',
      ],
      coverLetterSnippet:
        'This proposal is tailored for online retailers: full bookkeeping, VAT returns, and annual compliance designed around high transaction volumes.',
    },
    // ---- Sole trader ----
    {
      name: 'Sole Trader Essentials — Accounts & Self Assessment',
      description: 'Core annual package for sole traders',
      title: 'Sole trader engagement',
      targetEntityType: 'SOLE_TRADER',
      serviceNames: ['Sole Trader Annual Accounts', 'Personal Tax Return (SA100)'],
      coverLetterSnippet:
        'We are pleased to set out our fees for preparing your annual accounts and self-assessment tax return.',
    },
    {
      name: 'Sole Trader Complete — Accounts, Self Assessment & Bookkeeping',
      description: 'Full-service sole trader package with monthly bookkeeping',
      title: 'Complete sole trader engagement',
      targetEntityType: 'SOLE_TRADER',
      serviceNames: [
        'Sole Trader Annual Accounts',
        'Personal Tax Return (SA100)',
        'Full Bookkeeping Service',
      ],
      coverLetterSnippet:
        'This proposal covers your bookkeeping through the year plus annual accounts and self assessment — one fixed monthly fee, no year-end surprises.',
    },
    {
      name: 'Sole Trader VAT Package',
      description: 'Sole trader compliance with quarterly VAT returns',
      title: 'Sole trader VAT engagement',
      targetEntityType: 'SOLE_TRADER',
      serviceNames: [
        'Sole Trader Annual Accounts',
        'Personal Tax Return (SA100)',
        'VAT Return Preparation',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your annual accounts, self assessment, and MTD-compliant VAT returns.',
    },
    {
      name: 'CIS Subcontractor — Self Assessment & Refund Claim',
      description: 'Subcontractor package: accounts, tax return, and CIS refund',
      title: 'CIS subcontractor engagement',
      targetEntityType: 'SOLE_TRADER',
      targetIndustry: 'Construction',
      serviceNames: [
        'CIS Subcontractor Returns & Refunds',
        'Sole Trader Annual Accounts',
        'Personal Tax Return (SA100)',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for reconciling your CIS deductions and preparing your accounts and tax return, including any repayment claim due.',
    },
    {
      name: 'Landlord Essentials — Property Accounts & Self Assessment',
      description: 'Rental accounts and self assessment for landlords',
      title: 'Landlord engagement',
      targetEntityType: 'SOLE_TRADER',
      targetIndustry: 'Property & lettings',
      serviceNames: ['Landlord Property Accounts', 'Personal Tax Return (SA100)'],
      coverLetterSnippet:
        'We are pleased to set out our fees for preparing your rental property accounts and self-assessment tax return.',
    },
    {
      name: 'Landlord MTD ITSA — Quarterly Returns & Digital Setup',
      description: 'MTD-ready landlord package with quarterly submissions',
      title: 'Landlord MTD engagement',
      targetEntityType: 'SOLE_TRADER',
      targetIndustry: 'Property & lettings',
      serviceNames: [
        'MTD ITSA Quarterly Return',
        'MTD Digital Setup & Training',
        'Landlord Property Accounts',
      ],
      coverLetterSnippet:
        'This proposal gets your property income ready for Making Tax Digital: software setup, quarterly submissions, and annual property accounts.',
    },
    {
      name: 'Non-Resident Landlord Package',
      description: 'UK tax compliance for landlords living overseas',
      title: 'Non-resident landlord engagement',
      targetEntityType: 'SOLE_TRADER',
      targetIndustry: 'Property & lettings',
      serviceNames: ['Non-Resident Landlord Tax Return', 'Landlord Property Accounts'],
      coverLetterSnippet:
        'We are pleased to set out our fees for managing your UK rental tax affairs while you are overseas, including the residence pages of your return.',
    },
    {
      name: 'Property Sale CGT — 60-Day Report & Self Assessment',
      description: 'Property disposal reporting with the annual tax return',
      title: 'Property disposal engagement',
      targetEntityType: 'SOLE_TRADER',
      targetIndustry: 'Property & lettings',
      serviceNames: ['Property Disposal CGT Return', 'Personal Tax Return (SA100)'],
      coverLetterSnippet:
        'This proposal covers the capital gains tax return due within 60 days of your property sale, plus your annual self assessment.',
    },
    {
      name: 'MTD ITSA Ready — Transition, Setup & Quarterly Returns',
      description: 'Complete transition to Making Tax Digital for Income Tax',
      title: 'MTD ITSA transition engagement',
      targetEntityType: 'SOLE_TRADER',
      serviceNames: [
        'MTD ITSA Transition Review',
        'MTD Digital Setup & Training',
        'MTD ITSA Quarterly Return',
      ],
      coverLetterSnippet:
        'This proposal takes you through the move to Making Tax Digital step by step: readiness review, software setup and training, then quarterly submissions.',
    },
    {
      name: 'Personal Crypto Tax — Reporting & Self Assessment',
      description: 'Cryptoasset gains reporting with self assessment',
      title: 'Personal cryptoasset engagement',
      targetEntityType: 'SOLE_TRADER',
      serviceNames: ['Cryptoasset Tax Reporting', 'Personal Tax Return (SA100)'],
      coverLetterSnippet:
        'We are pleased to set out our fees for reviewing your cryptoasset transactions and reporting gains and income through your self-assessment tax return.',
    },
    {
      name: 'Sole Trader to Limited — Structure Review & Incorporation',
      description: 'Incorporation decision support and company formation',
      title: 'Incorporation engagement',
      targetEntityType: 'SOLE_TRADER',
      serviceNames: ['Business Structure Review', 'Company Formation & Startup Support'],
      coverLetterSnippet:
        'This proposal covers a full review of whether incorporation is right for you, and if so, handles the formation and registrations from start to finish.',
    },
    {
      name: 'Sole Trader Peace of Mind — Compliance & Fee Protection',
      description: 'Sole trader compliance with tax investigation fee protection',
      title: 'Compliance & protection engagement',
      targetEntityType: 'SOLE_TRADER',
      serviceNames: [
        'Sole Trader Annual Accounts',
        'Personal Tax Return (SA100)',
        'Tax Investigation Fee Protection',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your annual accounts and tax return, with fee protection included should HMRC open an enquiry.',
    },
    {
      name: 'Hospitality Sole Trader — Accounts, VAT & Payroll',
      description: 'Hospitality package covering staff payroll and VAT',
      title: 'Hospitality engagement',
      targetEntityType: 'SOLE_TRADER',
      targetIndustry: 'Hospitality',
      serviceNames: [
        'Sole Trader Annual Accounts',
        'Personal Tax Return (SA100)',
        'VAT Return Preparation',
        'Monthly Payroll Processing',
      ],
      coverLetterSnippet:
        'This proposal is tailored for hospitality businesses: accounts, self assessment, VAT, and staff payroll handled together.',
    },
    // ---- Partnership ----
    {
      name: 'Partnership Essentials — Accounts & SA800',
      description: 'Core annual compliance for partnerships',
      title: 'Partnership engagement',
      targetEntityType: 'PARTNERSHIP',
      serviceNames: ['Partnership Annual Accounts', 'Partnership Tax Return (SA800)'],
      coverLetterSnippet:
        'We are pleased to set out our fees for preparing your partnership accounts and the SA800 partnership tax return.',
    },
    {
      name: 'Partnership Complete — Accounts, SA800 & Partners’ Returns',
      description: 'Partnership compliance including the partners’ personal returns',
      title: 'Complete partnership engagement',
      targetEntityType: 'PARTNERSHIP',
      serviceNames: [
        'Partnership Annual Accounts',
        'Partnership Tax Return (SA800)',
        'Personal Tax Return (SA100)',
      ],
      coverLetterSnippet:
        'This proposal covers the partnership accounts, the SA800 return, and each partner’s personal self assessment — everything filed consistently from one set of figures.',
    },
    {
      name: 'Partnership VAT & Bookkeeping',
      description: 'Partnership compliance with VAT and monthly bookkeeping',
      title: 'Partnership VAT engagement',
      targetEntityType: 'PARTNERSHIP',
      serviceNames: [
        'Partnership Annual Accounts',
        'Partnership Tax Return (SA800)',
        'VAT Return Preparation',
        'Full Bookkeeping Service',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your partnership’s bookkeeping, VAT returns, annual accounts, and partnership tax return.',
    },
    {
      name: 'Farming Partnership — Accounts, SA800 & VAT',
      description: 'Agricultural partnership compliance package',
      title: 'Farming partnership engagement',
      targetEntityType: 'PARTNERSHIP',
      targetIndustry: 'Agriculture',
      serviceNames: [
        'Partnership Annual Accounts',
        'Partnership Tax Return (SA800)',
        'VAT Return Preparation',
      ],
      coverLetterSnippet:
        'This proposal is tailored for farming partnerships and reflects typical UK practice fee structures for agricultural clients.',
    },
    // ---- LLP ----
    {
      name: 'LLP Essentials — Accounts, SA800 & Company Secretarial',
      description: 'Core annual compliance for LLPs',
      title: 'LLP engagement',
      targetEntityType: 'LLP',
      serviceNames: [
        'Statutory Annual Accounts',
        'Partnership Tax Return (SA800)',
        'Company Secretarial Service',
      ],
      coverLetterSnippet:
        'We are pleased to set out our fees for your LLP’s statutory accounts, partnership tax return, and company secretarial support.',
    },
    {
      name: 'LLP Complete — Accounts, SA800, VAT & Payroll',
      description: 'Full-service LLP package',
      title: 'Complete LLP engagement',
      targetEntityType: 'LLP',
      serviceNames: [
        'Statutory Annual Accounts',
        'Partnership Tax Return (SA800)',
        'VAT Return Preparation',
        'Monthly Payroll Processing',
      ],
      coverLetterSnippet:
        'This proposal covers your LLP’s statutory accounts, partnership tax return, VAT, and payroll in a single engagement.',
    },
    {
      name: 'Professional Practice LLP — Accounts, Management Accounts & Virtual FD',
      description: 'Advisory-led package for professional services LLPs',
      title: 'Professional practice engagement',
      targetEntityType: 'LLP',
      targetIndustry: 'Professional services',
      serviceNames: [
        'Statutory Annual Accounts',
        'Partnership Tax Return (SA800)',
        'Management Accounts',
        'Virtual Finance Director',
      ],
      coverLetterSnippet:
        'This proposal is tailored for professional services firms: statutory compliance plus regular management information and board-level financial support.',
    },
    // ---- Charity / not-for-profit ----
    {
      name: 'Charity Essentials — Accounts & Annual Return',
      description: 'Core annual compliance for registered charities',
      title: 'Charity engagement',
      targetEntityType: 'CHARITY',
      serviceNames: ['Charity Annual Accounts (SORP)', 'Charity Annual Return'],
      coverLetterSnippet:
        'We are pleased to set out our fees for preparing your charity’s annual accounts and filing the annual return with the Charity Commission.',
    },
    {
      name: 'Charity Assurance — Accounts, Independent Examination & Annual Return',
      description: 'Charity compliance with independent examination',
      title: 'Charity assurance engagement',
      targetEntityType: 'CHARITY',
      serviceNames: [
        'Charity Annual Accounts (SORP)',
        'Charity Independent Examination',
        'Charity Annual Return',
      ],
      coverLetterSnippet:
        'This proposal covers your charity’s annual accounts, the independent examination, and the annual return — full assurance for your trustees in one engagement.',
    },
    {
      name: 'Charity Operations — Bookkeeping, Pension Duties & Accounts',
      description: 'Day-to-day finance support for charities',
      title: 'Charity operations engagement',
      targetEntityType: 'CHARITY',
      serviceNames: [
        'Quarterly Bookkeeping Service',
        'Auto-Enrolment Pension Administration',
        'Charity Annual Accounts (SORP)',
      ],
      coverLetterSnippet:
        'This proposal supports your charity’s day-to-day finances: regular bookkeeping, workplace pension duties, and annual accounts under the Charities SORP.',
    },
    {
      name: 'Community Organisation Essentials — Accounts & Annual Return',
      description: 'Core compliance for community organisations and CICs',
      title: 'Community organisation engagement',
      targetEntityType: 'NON_PROFIT',
      serviceNames: ['Charity Annual Accounts (SORP)', 'Charity Annual Return'],
      coverLetterSnippet:
        'We are pleased to set out our fees for preparing your organisation’s annual accounts and required filings.',
    },
    {
      name: 'Community Organisation Assurance — Accounts & Independent Examination',
      description: 'Not-for-profit accounts with independent examination',
      title: 'Community assurance engagement',
      targetEntityType: 'NON_PROFIT',
      serviceNames: ['Charity Annual Accounts (SORP)', 'Charity Independent Examination'],
      coverLetterSnippet:
        'This proposal covers your organisation’s annual accounts together with an independent examination, giving your board and funders added assurance.',
    },
  ];
}

let _cache: ProposalTemplatePackageDef[] | null = null;

export function getUkProposalTemplatePackages(): ProposalTemplatePackageDef[] {
  if (_cache) return _cache;
  const combined = [
    ...buildSingleServiceTemplates(),
    ...buildBundleTemplates(),
    ...buildIndustryTemplates(),
    ...buildCuratedPracticePackages(),
  ];
  const seen = new Set<string>();
  _cache = combined.filter((t) => {
    const key = `${t.name}|${t.targetEntityType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return _cache;
}

export function getUkProposalTemplatePackageCount(): number {
  return getUkProposalTemplatePackages().length;
}
