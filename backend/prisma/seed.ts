import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data
  await prisma.$transaction([
    prisma.activityLog.deleteMany(),
    prisma.proposalDocument.deleteMany(),
    prisma.proposalService.deleteMany(),
    prisma.proposal.deleteMany(),
    prisma.pricingRule.deleteMany(),
    prisma.serviceTemplate.deleteMany(),
    prisma.proposalTemplate.deleteMany(),
    prisma.client.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
    prisma.tenant.deleteMany(),
  ]);

  console.log('🧹 Cleaned existing data');

  // Create demo tenant
  const demoTenant = await prisma.tenant.create({
    data: {
      subdomain: 'demo',
      name: 'Demo Accounting Practice',
      primaryColor: '#0ea5e9',
      secondaryColor: '#38bdf8',
      settings: JSON.stringify({
        defaultCurrency: 'GBP',
        defaultPaymentTerms: 30,
        vatRegistered: true,
        vatNumber: 'GB123456789',
        professionalBody: 'ACCA',
        companyRegistration: '12345678',
        address: {
          line1: '123 Finance Street',
          city: 'London',
          postcode: 'EC1A 1BB',
          country: 'United Kingdom',
        },
      }),
    },
  });

  console.log('✅ Created demo tenant:', demoTenant.name);

  // Create admin user
  const passwordHash = await bcrypt.hash('DemoPass123!', 12);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@demo.practice',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'PARTNER',
      tenantId: demoTenant.id,
      isActive: true,
    },
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create additional users
  const managerUser = await prisma.user.create({
    data: {
      email: 'manager@demo.practice',
      passwordHash: await bcrypt.hash('DemoPass123!', 12),
      firstName: 'Michael',
      lastName: 'Chen',
      role: 'MANAGER',
      tenantId: demoTenant.id,
      isActive: true,
    },
  });

  const seniorUser = await prisma.user.create({
    data: {
      email: 'senior@demo.practice',
      passwordHash: await bcrypt.hash('DemoPass123!', 12),
      firstName: 'Emily',
      lastName: 'Rodriguez',
      role: 'SENIOR',
      tenantId: demoTenant.id,
      isActive: true,
    },
  });

  console.log('✅ Created team users');

  // Create sample clients
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        tenantId: demoTenant.id,
        name: 'TechStart Ltd',
        companyType: 'LIMITED_COMPANY',
        contactEmail: 'director@techstart.co.uk',
        contactPhone: '+44 20 7946 0958',
        contactName: 'James Wilson',
        companyNumber: '09876543',
        utr: '1234567890',
        vatNumber: 'GB987654321',
        vatRegistered: true,
        address: JSON.stringify({
          line1: '45 Innovation Hub',
          line2: 'Tech Quarter',
          city: 'Manchester',
          postcode: 'M1 1AA',
          country: 'United Kingdom',
        }),
        industry: 'Technology',
        employeeCount: 12,
        turnover: 850000,
        yearEnd: '03-31',
        mtditsaStatus: 'NOT_REQUIRED',
        mtditsaEligible: false,
        isActive: true,
      },
    }),
    prisma.client.create({
      data: {
        tenantId: demoTenant.id,
        name: 'Sarah Smith Consulting',
        companyType: 'SOLE_TRADER',
        contactEmail: 'sarah@sarahsmithconsulting.co.uk',
        contactPhone: '+44 20 7946 1234',
        utr: '9876543210',
        vatRegistered: false,
        address: JSON.stringify({
          line1: '12 High Street',
          city: 'Birmingham',
          postcode: 'B1 1AA',
          country: 'United Kingdom',
        }),
        industry: 'Consulting',
        employeeCount: 1,
        turnover: 65000,
        yearEnd: '04-05',
        mtditsaStatus: 'REQUIRED_2026',
        mtditsaIncome: 65000,
        mtditsaEligible: true,
        isActive: true,
      },
    }),
    prisma.client.create({
      data: {
        tenantId: demoTenant.id,
        name: 'Green Energy Solutions LLP',
        companyType: 'LLP',
        contactEmail: 'partners@greenenergyllp.co.uk',
        contactPhone: '+44 20 7946 5678',
        contactName: 'David & Emma Green',
        companyNumber: 'OC123456',
        utr: '5555666677',
        vatNumber: 'GB112233445',
        vatRegistered: true,
        address: JSON.stringify({
          line1: '78 Eco Business Park',
          city: 'Bristol',
          postcode: 'BS1 5TR',
          country: 'United Kingdom',
        }),
        industry: 'Renewable Energy',
        employeeCount: 8,
        turnover: 450000,
        yearEnd: '12-31',
        mtditsaStatus: 'NOT_REQUIRED',
        mtditsaEligible: false,
        isActive: true,
      },
    }),
    prisma.client.create({
      data: {
        tenantId: demoTenant.id,
        name: 'Smith & Jones Partnership',
        companyType: 'PARTNERSHIP',
        contactEmail: 'accounts@sjpartnership.co.uk',
        contactPhone: '+44 20 7946 9999',
        utr: '1122334455',
        vatRegistered: true,
        vatNumber: 'GB554433221',
        address: JSON.stringify({
          line1: '23 Market Square',
          city: 'Leeds',
          postcode: 'LS1 4PL',
          country: 'United Kingdom',
        }),
        industry: 'Retail',
        employeeCount: 25,
        turnover: 1200000,
        yearEnd: '03-31',
        mtditsaStatus: 'NOT_REQUIRED',
        mtditsaEligible: false,
        isActive: true,
      },
    }),
  ]);

  console.log('✅ Created sample clients:', clients.length);

  // Create default service templates
  const services = await Promise.all([
    prisma.serviceTemplate.create({
      data: {
        tenantId: demoTenant.id,
        category: 'COMPLIANCE',
        name: 'Annual Accounts Preparation',
        description: 'Preparation and filing of statutory annual accounts with Companies House',
        longDescription: 'Comprehensive preparation of your annual statutory accounts in accordance with UK GAAP or FRS 102, including all necessary disclosures and notes.',
        basePrice: 750,
        baseHours: 5,
        pricingModel: 'FIXED',
        frequencyOptions: 'ANNUALLY',
        defaultFrequency: 'ANNUALLY',
        applicableEntityTypes: 'LIMITED_COMPANY,LLP',
        complexityFactors: JSON.stringify([
          { name: 'transaction_volume', description: 'High transaction volume', multiplier: 1.3, appliesTo: ['LIMITED_COMPANY'] },
          { name: 'group_structure', description: 'Group/consolidation required', multiplier: 1.5, appliesTo: ['LIMITED_COMPANY'] },
        ]),
        deliverables: JSON.stringify(['Draft accounts for review', 'Final statutory accounts', 'Companies House filing confirmation']),
        tags: 'accounts,compliance,companies-house',
        isActive: true,
        isPopular: true,
      },
    }),
    prisma.serviceTemplate.create({
      data: {
        tenantId: demoTenant.id,
        category: 'COMPLIANCE',
        name: 'Corporation Tax Return (CT600)',
        description: 'Preparation and submission of Corporation Tax Return to HMRC',
        longDescription: 'Complete preparation of your CT600 corporation tax return, including tax computations and capital allowances claims.',
        basePrice: 600,
        baseHours: 4,
        pricingModel: 'FIXED',
        frequencyOptions: 'ANNUALLY',
        defaultFrequency: 'ANNUALLY',
        applicableEntityTypes: 'LIMITED_COMPANY',
        complexityFactors: JSON.stringify([
          { name: 'rd_claim', description: 'R&D tax credit claim', multiplier: 1.4, appliesTo: ['LIMITED_COMPANY'] },
        ]),
        deliverables: JSON.stringify(['Tax computation', 'CT600 form', 'iXBRL accounts', 'HMRC submission confirmation']),
        tags: 'tax,ct600,hmrc,compliance',
        isActive: true,
        isPopular: true,
      },
    }),
    prisma.serviceTemplate.create({
      data: {
        tenantId: demoTenant.id,
        category: 'COMPLIANCE',
        name: 'Self Assessment Tax Return',
        description: 'Personal tax return preparation for sole traders and individuals',
        longDescription: 'Complete Self Assessment tax return preparation including all income sources, allowances, and reliefs.',
        basePrice: 250,
        baseHours: 2,
        pricingModel: 'FIXED',
        frequencyOptions: 'ANNUALLY',
        defaultFrequency: 'ANNUALLY',
        applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP,LIMITED_COMPANY',
        complexityFactors: JSON.stringify([
          { name: 'property_income', description: 'Rental property income', multiplier: 1.3, appliesTo: ['SOLE_TRADER'] },
          { name: 'foreign_income', description: 'Foreign income sources', multiplier: 1.5, appliesTo: ['SOLE_TRADER'] },
        ]),
        deliverables: JSON.stringify(['Tax computation', 'SA100 return', 'HMRC submission confirmation']),
        tags: 'self-assessment,tax,hmrc,personal-tax',
        isActive: true,
      },
    }),
    prisma.serviceTemplate.create({
      data: {
        tenantId: demoTenant.id,
        category: 'COMPLIANCE',
        name: 'MTD ITSA Quarterly Submissions',
        description: 'Making Tax Digital quarterly income tax submissions',
        longDescription: 'Quarterly submission service for Making Tax Digital for Income Tax Self Assessment.',
        basePrice: 100,
        baseHours: 1,
        pricingModel: 'FIXED',
        frequencyOptions: 'QUARTERLY',
        defaultFrequency: 'QUARTERLY',
        applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP',
        complexityFactors: JSON.stringify([
          { name: 'multiple_sources', description: 'Multiple income sources', multiplier: 1.3, appliesTo: ['SOLE_TRADER'] },
        ]),
        deliverables: JSON.stringify(['Quarterly summary', 'HMRC submission confirmation', 'Tax estimate']),
        regulatoryNotes: 'Required from April 2026 for income over £50,000',
        tags: 'mtd,itsa,quarterly,hmrc,digital-tax',
        isActive: true,
        isPopular: true,
      },
    }),
    prisma.serviceTemplate.create({
      data: {
        tenantId: demoTenant.id,
        category: 'COMPLIANCE',
        name: 'Payroll Processing',
        description: 'Monthly payroll processing including payslips and RTI submissions',
        longDescription: 'Complete payroll service including payslip generation, RTI submissions to HMRC, and year-end reporting.',
        basePrice: 25,
        baseHours: 0.5,
        pricingModel: 'PER_EMPLOYEE',
        frequencyOptions: 'MONTHLY',
        defaultFrequency: 'MONTHLY',
        applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
        complexityFactors: JSON.stringify([
          { name: 'auto_enrolment', description: 'Pension auto-enrolment', multiplier: 1.2, appliesTo: ['LIMITED_COMPANY'] },
        ]),
        deliverables: JSON.stringify(['Payslips', 'RTI submissions', 'P32 report', 'P60s annually']),
        tags: 'payroll,rti,hmrc,employees',
        isActive: true,
        isPopular: true,
      },
    }),
    prisma.serviceTemplate.create({
      data: {
        tenantId: demoTenant.id,
        category: 'COMPLIANCE',
        name: 'VAT Return',
        description: 'Quarterly or monthly VAT return preparation and submission',
        longDescription: 'Preparation and submission of your VAT returns, including reconciliation and MTD compliance.',
        basePrice: 150,
        baseHours: 1.5,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY,QUARTERLY',
        defaultFrequency: 'QUARTERLY',
        applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP',
        complexityFactors: JSON.stringify([
          { name: 'partial_exemption', description: 'Partial exemption calculations', multiplier: 1.5, appliesTo: ['LIMITED_COMPANY'] },
        ]),
        deliverables: JSON.stringify(['VAT reconciliation', 'VAT return filing', 'MTD submission confirmation']),
        tags: 'vat,mtd,hmrc,compliance',
        isActive: true,
      },
    }),
    prisma.serviceTemplate.create({
      data: {
        tenantId: demoTenant.id,
        category: 'ADVISORY',
        name: 'Management Accounts',
        description: 'Monthly or quarterly management accounts and reporting',
        longDescription: 'Regular management accounts providing insight into your business performance.',
        basePrice: 350,
        baseHours: 3,
        pricingModel: 'FIXED',
        frequencyOptions: 'MONTHLY,QUARTERLY',
        defaultFrequency: 'QUARTERLY',
        applicableEntityTypes: 'LIMITED_COMPANY,PARTNERSHIP,LLP',
        deliverables: JSON.stringify(['Management accounts pack', 'Variance analysis', 'KPI dashboard']),
        tags: 'management-accounts,reporting,advisory',
        isActive: true,
      },
    }),
    prisma.serviceTemplate.create({
      data: {
        tenantId: demoTenant.id,
        category: 'TECHNICAL',
        name: 'R&D Tax Credit Claim',
        description: 'Research & Development tax credit claim preparation',
        longDescription: 'Full R&D tax credit claim service including technical report preparation.',
        basePrice: 2000,
        baseHours: 15,
        pricingModel: 'FIXED',
        frequencyOptions: 'ANNUALLY',
        defaultFrequency: 'ANNUALLY',
        applicableEntityTypes: 'LIMITED_COMPANY',
        deliverables: JSON.stringify(['Technical narrative', 'Cost breakdown', 'CT600 amendment', 'HMRC correspondence']),
        tags: 'rnd,tax-credits,innovation,hmrc',
        isActive: true,
      },
    }),
  ]);

  console.log('✅ Created service templates:', services.length);

  // Create sample proposals
  const proposals = await Promise.all([
    prisma.proposal.create({
      data: {
        tenantId: demoTenant.id,
        clientId: clients[0].id,
        createdById: adminUser.id,
        reference: 'PROP-2024-001',
        title: 'Annual Compliance Package 2024/25',
        status: 'SENT',
        validUntil: new Date('2024-12-31'),
        subtotal: 2850,
        discountAmount: 0,
        vatAmount: 570,
        total: 3420,
        paymentTerms: '30 days',
        paymentFrequency: 'MONTHLY',
        coverLetter: 'Dear James,\n\nThank you for the opportunity to present this proposal for your annual compliance requirements. Based on our discussions, we have prepared a comprehensive package covering all your statutory obligations.\n\nWe look forward to working with you.\n\nBest regards,\nSarah Johnson',
        terms: 'Standard terms and conditions apply. Payment due within 30 days of invoice date.',
        sentAt: new Date('2024-11-01'),
      },
    }),
    prisma.proposal.create({
      data: {
        tenantId: demoTenant.id,
        clientId: clients[1].id,
        createdById: managerUser.id,
        reference: 'PROP-2024-002',
        title: 'Sole Trader Services including MTD ITSA',
        status: 'ACCEPTED',
        validUntil: new Date('2024-12-15'),
        subtotal: 850,
        discountAmount: 50,
        vatAmount: 160,
        total: 960,
        paymentTerms: 'Monthly by Direct Debit',
        paymentFrequency: 'MONTHLY',
        coverLetter: 'Dear Sarah,\n\nAs discussed, this proposal covers your transition to Making Tax Digital for Income Tax Self Assessment, effective from April 2026.\n\nThe package includes quarterly submissions and year-end tax return preparation.',
        acceptedAt: new Date('2024-11-10'),
        acceptedBy: 'Sarah Smith',
      },
    }),
  ]);

  // Add proposal services
  await Promise.all([
    prisma.proposalService.create({
      data: {
        proposalId: proposals[0].id,
        serviceTemplateId: services[0].id,
        name: 'Annual Accounts Preparation',
        description: 'Preparation and filing of statutory annual accounts',
        quantity: 1,
        unitPrice: 750,
        discountPercent: 0,
        total: 750,
        frequency: 'ANNUALLY',
      },
    }),
    prisma.proposalService.create({
      data: {
        proposalId: proposals[0].id,
        serviceTemplateId: services[1].id,
        name: 'Corporation Tax Return (CT600)',
        description: 'Preparation and submission of Corporation Tax Return',
        quantity: 1,
        unitPrice: 600,
        discountPercent: 0,
        total: 600,
        frequency: 'ANNUALLY',
      },
    }),
    prisma.proposalService.create({
      data: {
        proposalId: proposals[0].id,
        serviceTemplateId: services[5].id,
        name: 'VAT Return',
        description: 'Quarterly VAT return preparation',
        quantity: 4,
        unitPrice: 150,
        discountPercent: 0,
        total: 600,
        frequency: 'QUARTERLY',
      },
    }),
    prisma.proposalService.create({
      data: {
        proposalId: proposals[0].id,
        serviceTemplateId: services[4].id,
        name: 'Payroll Processing',
        description: 'Monthly payroll for 12 employees',
        quantity: 12,
        unitPrice: 25,
        discountPercent: 10,
        total: 270,
        frequency: 'MONTHLY',
      },
    }),
    prisma.proposalService.create({
      data: {
        proposalId: proposals[1].id,
        serviceTemplateId: services[2].id,
        name: 'Self Assessment Tax Return',
        description: 'Annual Self Assessment tax return',
        quantity: 1,
        unitPrice: 250,
        discountPercent: 0,
        total: 250,
        frequency: 'ANNUALLY',
      },
    }),
    prisma.proposalService.create({
      data: {
        proposalId: proposals[1].id,
        serviceTemplateId: services[3].id,
        name: 'MTD ITSA Quarterly Submissions',
        description: 'Quarterly MTD submissions',
        quantity: 4,
        unitPrice: 100,
        discountPercent: 0,
        total: 400,
        frequency: 'QUARTERLY',
      },
    }),
    prisma.proposalService.create({
      data: {
        proposalId: proposals[1].id,
        name: 'Bookkeeping',
        description: 'Quarterly bookkeeping service',
        quantity: 4,
        unitPrice: 100,
        discountPercent: 0,
        total: 400,
        frequency: 'QUARTERLY',
      },
    }),
  ]);

  console.log('✅ Created sample proposals:', proposals.length);

  // Create activity logs
  await prisma.activityLog.createMany({
    data: [
      {
        tenantId: demoTenant.id,
        userId: adminUser.id,
        action: 'TENANT_CREATED',
        entityType: 'TENANT',
        entityId: demoTenant.id,
        description: 'Demo tenant created',
      },
      {
        tenantId: demoTenant.id,
        userId: adminUser.id,
        action: 'CLIENT_CREATED',
        entityType: 'CLIENT',
        entityId: clients[0].id,
        description: 'Created client TechStart Ltd',
      },
      {
        tenantId: demoTenant.id,
        userId: adminUser.id,
        action: 'PROPOSAL_CREATED',
        entityType: 'PROPOSAL',
        entityId: proposals[0].id,
        description: 'Created proposal PROP-2024-001',
      },
      {
        tenantId: demoTenant.id,
        userId: adminUser.id,
        action: 'PROPOSAL_SENT',
        entityType: 'PROPOSAL',
        entityId: proposals[0].id,
        description: 'Sent proposal to TechStart Ltd',
      },
      {
        tenantId: demoTenant.id,
        userId: managerUser.id,
        action: 'PROPOSAL_ACCEPTED',
        entityType: 'PROPOSAL',
        entityId: proposals[1].id,
        description: 'Proposal accepted by Sarah Smith',
      },
    ],
  });

  console.log('✅ Created activity logs');

  console.log('\n🎉 Database seeding completed!');
  console.log('\nDemo credentials:');
  console.log('  Email: admin@demo.practice');
  console.log('  Password: DemoPass123!');
  console.log('  Subdomain: demo');
  console.log('\nAPI endpoints:');
  console.log('  POST http://localhost:3001/api/auth/login');
  console.log('  GET  http://localhost:3001/api/clients');
  console.log('  GET  http://localhost:3001/api/proposals');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
