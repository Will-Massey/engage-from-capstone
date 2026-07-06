/**
 * Seed sector proposal templates (contractor, landlord, SME Ltd) for all tenants.
 * Run: npx tsx src/scripts/seed-proposal-templates.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATES = [
  {
    name: 'Contractor / Freelancer',
    description: 'Self-employed contractor engagement — accounts, SA, MTD ITSA',
    targetEntityType: 'SOLE_TRADER',
    targetIndustry: 'contractor',
    title: 'Accountancy Services for Contractors',
    coverLetter:
      'Thank you for considering our services. This proposal outlines our fixed-fee package tailored for contractors and freelancers, including self assessment, bookkeeping support, and MTD ITSA compliance where required.',
    serviceConfig: JSON.stringify([
      { name: 'Self Assessment Tax Return', quantity: 1, billingFrequency: 'ANNUALLY' },
      { name: 'Bookkeeping (Monthly)', quantity: 1, billingFrequency: 'MONTHLY' },
      { name: 'MTD ITSA Support', quantity: 1, billingFrequency: 'ANNUALLY' },
    ]),
    defaultPricing: JSON.stringify({ paymentTerms: '30 days', paymentFrequency: 'MONTHLY' }),
  },
  {
    name: 'Landlord Portfolio',
    description: 'Property landlord package — rental accounts, SA, CGT advice',
    targetEntityType: 'SOLE_TRADER',
    targetIndustry: 'landlord',
    title: 'Landlord Accountancy Services',
    coverLetter:
      'We specialise in supporting UK landlords with rental income reporting, property expense tracking, and tax-efficient structuring. This proposal sets out our recommended services for your property portfolio.',
    serviceConfig: JSON.stringify([
      { name: 'Rental Accounts & Self Assessment', quantity: 1, billingFrequency: 'ANNUALLY' },
      { name: 'Quarterly Bookkeeping Review', quantity: 1, billingFrequency: 'QUARTERLY' },
      { name: 'Capital Gains Tax Planning', quantity: 1, billingFrequency: 'ONE_TIME' },
    ]),
    defaultPricing: JSON.stringify({ paymentTerms: '30 days', paymentFrequency: 'QUARTERLY' }),
  },
  {
    name: 'SME Limited Company',
    description: 'Standard Ltd company compliance — accounts, CT, payroll, VAT',
    targetEntityType: 'LIMITED_COMPANY',
    targetIndustry: 'sme',
    title: 'Limited Company Compliance Package',
    coverLetter:
      'This proposal covers the core compliance services your limited company requires, including annual accounts, corporation tax, and ongoing support. We will ensure you remain fully compliant with Companies House and HMRC requirements.',
    serviceConfig: JSON.stringify([
      { name: 'Annual Accounts Preparation', quantity: 1, billingFrequency: 'ANNUALLY' },
      { name: 'Corporation Tax Return (CT600)', quantity: 1, billingFrequency: 'ANNUALLY' },
      { name: 'Confirmation Statement', quantity: 1, billingFrequency: 'ANNUALLY' },
      { name: 'Payroll Processing', quantity: 1, billingFrequency: 'MONTHLY' },
    ]),
    defaultPricing: JSON.stringify({ paymentTerms: '30 days', paymentFrequency: 'MONTHLY' }),
    isDefault: true,
  },
];

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  if (!tenants.length) {
    console.log('No tenants found — skipping proposal template seed');
    return;
  }

  for (const tenant of tenants) {
    for (const tpl of TEMPLATES) {
      const existing = await prisma.proposalTemplate.findFirst({
        where: { tenantId: tenant.id, name: tpl.name },
      });
      if (existing) {
        console.log(`  skip ${tenant.name}: ${tpl.name}`);
        continue;
      }

      await prisma.proposalTemplate.create({
        data: {
          tenantId: tenant.id,
          name: tpl.name,
          description: tpl.description,
          targetEntityType: tpl.targetEntityType,
          targetIndustry: tpl.targetIndustry,
          title: tpl.title,
          coverLetter: tpl.coverLetter,
          serviceConfig: tpl.serviceConfig,
          defaultPricing: tpl.defaultPricing,
          isDefault: tpl.isDefault ?? false,
          isActive: true,
        },
      });
      console.log(`  ✅ ${tenant.name}: ${tpl.name}`);
    }
  }

  console.log('Proposal template seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
