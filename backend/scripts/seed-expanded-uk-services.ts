/**
 * Idempotent upsert of expanded UK accountancy catalogue (competitor parity).
 * Usage: DATABASE_URL=... npx tsx scripts/seed-expanded-uk-services.ts
 */
import { PrismaClient, ServiceCategory, PricingModel, PricingFrequency } from '@prisma/client';

const prisma = new PrismaClient();

type SeedSvc = {
  name: string;
  description: string;
  longDescription?: string;
  category: ServiceCategory;
  basePrice: number;
  baseHours?: number;
  pricingModel?: PricingModel;
  billingCycle: PricingFrequency;
  defaultFrequency: PricingFrequency;
  frequencyOptions: string;
  applicableEntityTypes: string;
  tags: string;
  isPopular?: boolean;
  regulatoryNotes?: string;
};

const EXPANDED_SERVICES: SeedSvc[] = [
  {
    name: 'Partnership Tax Return (SA800)',
    description: 'Preparation and filing of partnership Self Assessment tax return.',
    category: 'TAX',
    basePrice: 650,
    baseHours: 5,
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
    applicableEntityTypes: 'PARTNERSHIP,LLP',
    tags: 'partnership,sa800,tax,hmrc',
    isPopular: true,
  },
  {
    name: 'CIS Monthly Returns',
    description: 'Construction Industry Scheme monthly return preparation and CIS300 submission.',
    category: 'COMPLIANCE',
    basePrice: 150,
    baseHours: 1.5,
    billingCycle: 'MONTHLY',
    defaultFrequency: 'MONTHLY',
    frequencyOptions: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER',
    tags: 'cis,construction,hmrc',
  },
  {
    name: 'Management Accounts',
    description: 'Monthly or quarterly management accounts with KPI commentary.',
    category: 'ADVISORY',
    basePrice: 450,
    baseHours: 3,
    billingCycle: 'QUARTERLY',
    defaultFrequency: 'QUARTERLY',
    frequencyOptions: 'MONTHLY,QUARTERLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP',
    tags: 'management-accounts,reporting,advisory',
    isPopular: true,
  },
  {
    name: 'Tax Planning & Advisory Review',
    description: 'Annual strategic tax planning review with written recommendations.',
    category: 'ADVISORY',
    basePrice: 600,
    baseHours: 4,
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'tax-planning,advisory',
    isPopular: true,
  },
  {
    name: 'Tax Investigation Fee Protection (TIPP)',
    description: 'Annual fee protection cover for HMRC enquiry and investigation costs.',
    category: 'ADVISORY',
    basePrice: 120,
    baseHours: 0.25,
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'tipp,fee-protection,hmrc-enquiry',
    isPopular: true,
  },
  {
    name: 'HMRC Enquiry & Investigation Support',
    description:
      'Professional support during HMRC enquiries, including correspondence and meetings.',
    category: 'ADVISORY',
    basePrice: 950,
    baseHours: 8,
    pricingModel: 'HOURLY',
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'hmrc,enquiry,investigation',
  },
  {
    name: 'Cash Flow Forecasting & Planning',
    description: '13-week rolling cash flow forecast with scenario planning and review.',
    category: 'ADVISORY',
    basePrice: 550,
    baseHours: 4,
    billingCycle: 'MONTHLY',
    defaultFrequency: 'MONTHLY',
    frequencyOptions: 'MONTHLY,QUARTERLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP',
    tags: 'cashflow,forecasting,advisory',
    isPopular: true,
  },
  {
    name: 'Payroll Initial Setup',
    description:
      'One-time payroll setup including HMRC registration, pension scheme, and first-run configuration.',
    category: 'PAYROLL',
    basePrice: 175,
    baseHours: 2,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP,SOLE_TRADER',
    tags: 'payroll,setup,rti',
  },
  {
    name: 'Bookkeeping — up to 50 transactions',
    description: 'Monthly bookkeeping for businesses with up to 50 bank transactions per month.',
    category: 'BOOKKEEPING',
    basePrice: 195,
    baseHours: 2,
    billingCycle: 'MONTHLY',
    defaultFrequency: 'MONTHLY',
    frequencyOptions: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'bookkeeping,transactions',
  },
  {
    name: 'Bookkeeping — up to 150 transactions',
    description: 'Monthly bookkeeping for businesses with up to 150 bank transactions per month.',
    category: 'BOOKKEEPING',
    basePrice: 325,
    baseHours: 3.5,
    billingCycle: 'MONTHLY',
    defaultFrequency: 'MONTHLY',
    frequencyOptions: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'bookkeeping,transactions',
    isPopular: true,
  },
  {
    name: 'Bookkeeping — up to 500 transactions',
    description: 'Monthly bookkeeping for businesses with up to 500 bank transactions per month.',
    category: 'BOOKKEEPING',
    basePrice: 495,
    baseHours: 5,
    billingCycle: 'MONTHLY',
    defaultFrequency: 'MONTHLY',
    frequencyOptions: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'bookkeeping,transactions',
  },
  {
    name: 'Catch-up Bookkeeping',
    description:
      'One-time catch-up bookkeeping to bring records up to date before ongoing services begin.',
    category: 'BOOKKEEPING',
    basePrice: 450,
    baseHours: 6,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'bookkeeping,catch-up,cleanup',
    isPopular: true,
  },
  {
    name: 'QuickBooks Setup & Integration',
    description:
      'QuickBooks Online implementation, bank feeds, chart of accounts, and staff training.',
    category: 'TECHNICAL',
    basePrice: 450,
    baseHours: 5,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'quickbooks,software,setup',
  },
  {
    name: 'FreeAgent Setup & Integration',
    description: 'FreeAgent cloud accounting setup with bank feeds and MTD configuration.',
    category: 'TECHNICAL',
    basePrice: 395,
    baseHours: 4,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'freeagent,software,setup',
  },
  {
    name: 'Sage Business Cloud Setup',
    description: 'Sage Accounting implementation with opening balances and user training.',
    category: 'TECHNICAL',
    basePrice: 475,
    baseHours: 5,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'sage,software,setup',
  },
  {
    name: 'R&D Tax Credit Claim',
    description:
      'Research and Development tax relief claim including technical narrative and CT600 amendment.',
    category: 'TECHNICAL',
    basePrice: 2500,
    baseHours: 15,
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY',
    tags: 'rnd,tax-credits,innovation',
  },
  {
    name: 'EIS / SEIS Advance Assurance',
    description:
      'Advance assurance application to HMRC for Enterprise Investment Scheme or SEIS qualifying companies.',
    category: 'TECHNICAL',
    basePrice: 1800,
    baseHours: 12,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY',
    tags: 'eis,seis,startup,tax-relief',
  },
  {
    name: 'VAT Registration Service',
    description: 'VAT registration with HMRC including scheme selection advice.',
    category: 'TAX',
    basePrice: 250,
    baseHours: 2,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'vat,registration,hmrc',
  },
  {
    name: 'Landlord & Property Income Tax',
    description: 'Self Assessment support for UK property rental income including SA105 schedules.',
    category: 'TAX',
    basePrice: 375,
    baseHours: 2.5,
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
    applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP,LIMITED_COMPANY',
    tags: 'landlord,property,sa105,self-assessment',
  },
  {
    name: 'Sole Trader Annual Accounts',
    description: 'Annual accounts prepared for self-assessment and lending purposes.',
    category: 'COMPLIANCE',
    basePrice: 450,
    baseHours: 3,
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
    applicableEntityTypes: 'SOLE_TRADER',
    tags: 'sole-trader,accounts,self-assessment',
  },
  {
    name: 'Company Secretarial Services',
    description:
      'Director appointments, share allotments, PSC updates, and Companies House filings.',
    category: 'SPECIALIZED',
    basePrice: 95,
    baseHours: 1,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP',
    tags: 'secretarial,companies-house,directors',
  },
  {
    name: 'Director Service Address',
    description:
      'Professional service address for company directors — mail scanning and forwarding.',
    category: 'SPECIALIZED',
    basePrice: 15,
    baseHours: 0.1,
    billingCycle: 'MONTHLY',
    defaultFrequency: 'MONTHLY',
    frequencyOptions: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY',
    tags: 'director,address,privacy',
  },
  {
    name: 'Credit Control & Debtor Management',
    description: 'Monthly credit control service including chaser emails and aged debt reporting.',
    category: 'ADVISORY',
    basePrice: 175,
    baseHours: 2,
    billingCycle: 'MONTHLY',
    defaultFrequency: 'MONTHLY',
    frequencyOptions: 'MONTHLY',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'credit-control,debtors,cashflow',
  },
  {
    name: 'KPI Dashboard & Management Reporting',
    description: 'Monthly KPI dashboard and management pack using your cloud accounting data.',
    category: 'ADVISORY',
    basePrice: 395,
    baseHours: 3,
    billingCycle: 'MONTHLY',
    defaultFrequency: 'MONTHLY',
    frequencyOptions: 'MONTHLY,QUARTERLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP',
    tags: 'kpi,dashboard,reporting,fathom',
  },
  {
    name: 'Quarterly Business Review Meeting',
    description: 'Structured quarterly review meeting with agenda, actions, and follow-up notes.',
    category: 'ADVISORY',
    basePrice: 250,
    baseHours: 2,
    billingCycle: 'QUARTERLY',
    defaultFrequency: 'QUARTERLY',
    frequencyOptions: 'QUARTERLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP',
    tags: 'advisory,review,meeting',
  },
  {
    name: 'Year-End Payroll (P60 & EPS)',
    description: 'Annual payroll year-end including P60s, final EPS, and payroll reconciliation.',
    category: 'PAYROLL',
    basePrice: 85,
    baseHours: 1,
    pricingModel: 'PER_EMPLOYEE',
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP',
    tags: 'payroll,p60,year-end',
  },
  {
    name: 'IR35 & Off-Payroll Working Review',
    description: 'Status review and documentation for contractors and off-payroll working rules.',
    category: 'ADVISORY',
    basePrice: 750,
    baseHours: 5,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER',
    tags: 'ir35,off-payroll,contractor',
  },
  {
    name: 'Business Valuation',
    description: 'Formal business valuation for sale, acquisition, or shareholder exit planning.',
    category: 'ADVISORY',
    basePrice: 2500,
    baseHours: 20,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,LLP,PARTNERSHIP',
    tags: 'valuation,exit,ma',
  },
  {
    name: 'MTD ITSA End of Period Statement (EOPS)',
    description: 'End of Period Statement submission under Making Tax Digital for Income Tax.',
    category: 'MTD_ITSA',
    basePrice: 95,
    baseHours: 1,
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
    applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP',
    tags: 'mtd-itsa,eops,hmrc',
    regulatoryNotes: 'Required under MTD ITSA for in-scope sole traders and landlords.',
  },
  {
    name: 'MTD ITSA Final Declaration',
    description: 'Final Declaration submission to HMRC after quarterly updates and EOPS.',
    category: 'MTD_ITSA',
    basePrice: 150,
    baseHours: 1.5,
    billingCycle: 'ANNUALLY',
    defaultFrequency: 'ANNUALLY',
    frequencyOptions: 'ANNUALLY',
    applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP',
    tags: 'mtd-itsa,final-declaration,hmrc',
  },
  {
    name: 'HMRC Agent Authorisation Setup',
    description: 'One-time setup of HMRC agent authorisation links for your business tax affairs.',
    category: 'COMPLIANCE',
    basePrice: 75,
    baseHours: 0.5,
    billingCycle: 'ONE_TIME',
    defaultFrequency: 'ONE_TIME',
    frequencyOptions: 'ONE_TIME',
    applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
    tags: 'hmrc,agent,authorisation,onboarding',
  },
];

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  let created = 0;
  let updated = 0;

  for (const tenant of tenants) {
    for (const svc of EXPANDED_SERVICES) {
      const existing = await prisma.serviceTemplate.findFirst({
        where: { tenantId: tenant.id, name: svc.name },
      });

      const data = {
        category: svc.category,
        description: svc.description,
        longDescription: svc.longDescription || svc.description,
        basePrice: svc.basePrice,
        priceAmount: svc.basePrice,
        baseHours: svc.baseHours ?? 1,
        pricingModel: svc.pricingModel || 'FIXED',
        billingCycle: svc.billingCycle,
        defaultFrequency: svc.defaultFrequency,
        frequencyOptions: svc.frequencyOptions,
        applicableEntityTypes: svc.applicableEntityTypes,
        tags: svc.tags,
        isActive: true,
        isPopular: svc.isPopular ?? false,
        regulatoryNotes: svc.regulatoryNotes || null,
        complexityFactors: '[]',
        requirements: '[]',
        deliverables: '[]',
      };

      if (existing) {
        await prisma.serviceTemplate.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.serviceTemplate.create({
          data: { ...data, tenantId: tenant.id, name: svc.name },
        });
        created++;
        console.log(`Created "${svc.name}" for ${tenant.name}`);
      }
    }
  }

  console.log(`Done — created ${created}, updated ${updated}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
