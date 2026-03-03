// Enhanced seed with more data for a rich demo experience
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting enhanced database seed...');

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
      name: 'Smith & Associates Accounting',
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

  // Create users
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

  // Create comprehensive service catalog
  const servicesData = [
    // COMPLIANCE SERVICES
    {
      category: 'COMPLIANCE',
      name: 'Annual Accounts Preparation',
      description: 'Preparation and filing of statutory annual accounts with Companies House',
      longDescription: 'Comprehensive preparation of your annual statutory accounts in accordance with UK GAAP or FRS 102, including all necessary disclosures and notes.',
      basePrice: 750,
      baseHours: 5,
      applicableEntityTypes: 'LIMITED_COMPANY,LLP',
      tags: 'accounts,compliance,companies-house',
      isPopular: true,
    },
    {
      category: 'COMPLIANCE',
      name: 'Corporation Tax Return (CT600)',
      description: 'Preparation and submission of Corporation Tax Return to HMRC',
      basePrice: 600,
      baseHours: 4,
      applicableEntityTypes: 'LIMITED_COMPANY',
      tags: 'tax,ct600,hmrc',
      isPopular: true,
    },
    {
      category: 'COMPLIANCE',
      name: 'Confirmation Statement',
      description: 'Annual Confirmation Statement filing with Companies House',
      basePrice: 75,
      baseHours: 0.5,
      applicableEntityTypes: 'LIMITED_COMPANY,LLP',
      tags: 'confirmation-statement,companies-house',
    },
    {
      category: 'COMPLIANCE',
      name: 'Self Assessment Tax Return',
      description: 'Personal tax return preparation for sole traders and individuals',
      basePrice: 250,
      baseHours: 2,
      applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP,LIMITED_COMPANY',
      tags: 'self-assessment,tax,hmrc',
    },
    {
      category: 'COMPLIANCE',
      name: 'VAT Return',
      description: 'Quarterly or monthly VAT return preparation and submission',
      basePrice: 150,
      baseHours: 1.5,
      pricingModel: 'PER_TRANSACTION',
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP',
      tags: 'vat,mtd,hmrc',
    },
    {
      category: 'COMPLIANCE',
      name: 'Payroll Processing',
      description: 'Monthly payroll processing including payslips and RTI submissions',
      basePrice: 25,
      baseHours: 0.5,
      pricingModel: 'PER_EMPLOYEE',
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
      tags: 'payroll,rti,hmrc,employees',
      isPopular: true,
    },
    {
      category: 'COMPLIANCE',
      name: 'CIS Returns',
      description: 'Construction Industry Scheme monthly returns',
      basePrice: 100,
      baseHours: 1,
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER',
      tags: 'cis,construction,hmrc',
    },
    {
      category: 'COMPLIANCE',
      name: 'P11D Benefits in Kind',
      description: 'Annual P11D forms for employee benefits',
      basePrice: 30,
      baseHours: 0.5,
      pricingModel: 'PER_EMPLOYEE',
      applicableEntityTypes: 'LIMITED_COMPANY',
      tags: 'p11d,benefits,employees',
    },
    // MTD ITSA
    {
      category: 'COMPLIANCE',
      name: 'MTD ITSA Quarterly Submissions',
      description: 'Making Tax Digital quarterly income tax submissions',
      basePrice: 100,
      baseHours: 1,
      frequencyOptions: 'QUARTERLY',
      applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP',
      tags: 'mtd,itsa,quarterly,hmrc',
      isPopular: true,
      regulatoryNotes: 'Required from April 2026',
    },
    {
      category: 'COMPLIANCE',
      name: 'MTD ITSA Transition Support',
      description: 'Full transition support for MTD ITSA including software setup and training',
      basePrice: 500,
      baseHours: 4,
      applicableEntityTypes: 'SOLE_TRADER,PARTNERSHIP',
      tags: 'mtd,itsa,transition,training',
    },
    // BOOKKEEPING
    {
      category: 'COMPLIANCE',
      name: 'Bookkeeping - Basic',
      description: 'Monthly bookkeeping up to 100 transactions',
      basePrice: 200,
      baseHours: 2,
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP',
      tags: 'bookkeeping,accounts',
    },
    {
      category: 'COMPLIANCE',
      name: 'Bookkeeping - Standard',
      description: 'Monthly bookkeeping up to 500 transactions',
      basePrice: 400,
      baseHours: 4,
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP',
      tags: 'bookkeeping,accounts',
    },
    {
      category: 'COMPLIANCE',
      name: 'Bookkeeping - Premium',
      description: 'Monthly bookkeeping unlimited transactions',
      basePrice: 750,
      baseHours: 8,
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP',
      tags: 'bookkeeping,accounts',
    },
    // ADVISORY SERVICES
    {
      category: 'ADVISORY',
      name: 'Management Accounts',
      description: 'Monthly or quarterly management accounts and reporting',
      basePrice: 350,
      baseHours: 3,
      applicableEntityTypes: 'LIMITED_COMPANY,PARTNERSHIP,LLP',
      tags: 'management-accounts,reporting,advisory',
    },
    {
      category: 'ADVISORY',
      name: 'Cash Flow Forecasting',
      description: '13-week rolling cash flow forecast with variance analysis',
      basePrice: 450,
      baseHours: 4,
      applicableEntityTypes: 'LIMITED_COMPANY,PARTNERSHIP,LLP',
      tags: 'cashflow,forecasting,advisory',
    },
    {
      category: 'ADVISORY',
      name: 'Business Structure Review',
      description: 'Review of business structure for tax efficiency',
      basePrice: 650,
      baseHours: 5,
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP',
      tags: 'structure,tax-planning,advisory',
    },
    {
      category: 'ADVISORY',
      name: 'Tax Planning Consultation',
      description: 'Strategic tax planning session with recommendations',
      basePrice: 500,
      baseHours: 4,
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP,LLP',
      tags: 'tax-planning,advisory',
    },
    {
      category: 'ADVISORY',
      name: 'Business Growth Planning',
      description: 'Strategic growth planning and financial projections',
      basePrice: 1200,
      baseHours: 10,
      applicableEntityTypes: 'LIMITED_COMPANY,PARTNERSHIP,LLP',
      tags: 'growth,strategy,advisory',
    },
    // TECHNICAL SERVICES
    {
      category: 'TECHNICAL',
      name: 'R&D Tax Credit Claim',
      description: 'Research & Development tax credit claim preparation',
      basePrice: 2000,
      baseHours: 15,
      applicableEntityTypes: 'LIMITED_COMPANY',
      tags: 'rnd,tax-credits,innovation',
    },
    {
      category: 'TECHNICAL',
      name: 'Capital Allowances Review',
      description: 'Comprehensive capital allowances claim review',
      basePrice: 800,
      baseHours: 6,
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP',
      tags: 'capital-allowances,tax',
    },
    {
      category: 'TECHNICAL',
      name: 'Share Scheme Setup',
      description: 'EMI or other share scheme implementation',
      basePrice: 1500,
      baseHours: 12,
      applicableEntityTypes: 'LIMITED_COMPANY',
      tags: 'shares,emi,employees',
    },
    {
      category: 'TECHNICAL',
      name: 'Company Valuation',
      description: 'Business valuation for sale, acquisition, or exit planning',
      basePrice: 2500,
      baseHours: 20,
      applicableEntityTypes: 'LIMITED_COMPANY',
      tags: 'valuation,sale,exit',
    },
    {
      category: 'TECHNICAL',
      name: 'Due Diligence Support',
      description: 'Financial due diligence for acquisitions or sales',
      basePrice: 1800,
      baseHours: 15,
      applicableEntityTypes: 'LIMITED_COMPANY',
      tags: 'due-diligence,acquisition,sale',
    },
    // SPECIALIZED SERVICES
    {
      category: 'SPECIALIZED',
      name: 'Audit Services',
      description: 'Statutory audit for companies requiring audit',
      basePrice: 3500,
      baseHours: 30,
      applicableEntityTypes: 'LIMITED_COMPANY',
      tags: 'audit,compliance,assurance',
    },
    {
      category: 'SPECIALIZED',
      name: 'Forensic Accounting',
      description: 'Fraud investigation and forensic accounting services',
      basePrice: 2500,
      baseHours: 20,
      applicableEntityTypes: 'LIMITED_COMPANY,PARTNERSHIP',
      tags: 'forensic,fraud,investigation',
    },
    {
      category: 'SPECIALIZED',
      name: 'Insolvency Support',
      description: 'Advice and support for insolvency situations',
      basePrice: 2000,
      baseHours: 16,
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP',
      tags: 'insolvency,restructuring',
    },
    {
      category: 'SPECIALIZED',
      name: 'International Tax',
      description: 'Cross-border tax planning and compliance',
      basePrice: 3000,
      baseHours: 24,
      applicableEntityTypes: 'LIMITED_COMPANY',
      tags: 'international,tax,global',
    },
    {
      category: 'SPECIALIZED',
      name: 'Property Tax Advisory',
      description: 'Property investment tax planning and SDLT advice',
      basePrice: 1200,
      baseHours: 10,
      applicableEntityTypes: 'LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP',
      tags: 'property,sdlt,tax',
    },
  ];

  const services = await Promise.all(
    servicesData.map((service, index) =>
      prisma.serviceTemplate.create({
        data: {
          tenantId: demoTenant.id,
          category: service.category,
          name: service.name,
          description: service.description,
          longDescription: service.longDescription || service.description,
          basePrice: service.basePrice,
          baseHours: service.baseHours || 1,
          pricingModel: service.pricingModel || 'FIXED',
          frequencyOptions: service.frequencyOptions || 'MONTHLY,QUARTERLY,ANNUALLY',
          defaultFrequency: service.defaultFrequency || 'MONTHLY',
          applicableEntityTypes: service.applicableEntityTypes || 'LIMITED_COMPANY,SOLE_TRADER',
          tags: service.tags || '',
          isActive: true,
          isPopular: service.isPopular || false,
          regulatoryNotes: service.regulatoryNotes || null,
          complexityFactors: JSON.stringify([]),
          requirements: JSON.stringify([]),
          deliverables: JSON.stringify([]),
        },
      })
    )
  );

  console.log('✅ Created service templates:', services.length);

  // Create more clients
  const clientsData = [
    {
      name: 'TechStart Ltd',
      companyType: 'LIMITED_COMPANY',
      email: 'director@techstart.co.uk',
      phone: '+44 20 7946 0958',
      contact: 'James Wilson',
      companyNumber: '09876543',
      utr: '1234567890',
      vatNumber: 'GB987654321',
      vatRegistered: true,
      address: { line1: '45 Innovation Hub', line2: 'Tech Quarter', city: 'Manchester', postcode: 'M1 1AA', country: 'United Kingdom' },
      industry: 'Technology',
      employees: 12,
      turnover: 850000,
      yearEnd: '03-31',
      mtditsaStatus: 'NOT_REQUIRED',
      mtditsaEligible: false,
    },
    {
      name: 'Sarah Smith Consulting',
      companyType: 'SOLE_TRADER',
      email: 'sarah@sarahsmithconsulting.co.uk',
      phone: '+44 20 7946 1234',
      utr: '9876543210',
      vatRegistered: false,
      address: { line1: '12 High Street', city: 'Birmingham', postcode: 'B1 1AA', country: 'United Kingdom' },
      industry: 'Consulting',
      employees: 1,
      turnover: 65000,
      yearEnd: '04-05',
      mtditsaStatus: 'REQUIRED_2026',
      mtditsaIncome: 65000,
      mtditsaEligible: true,
    },
    {
      name: 'Green Energy Solutions LLP',
      companyType: 'LLP',
      email: 'partners@greenenergyllp.co.uk',
      phone: '+44 20 7946 5678',
      contact: 'David & Emma Green',
      companyNumber: 'OC123456',
      utr: '5555666677',
      vatNumber: 'GB112233445',
      vatRegistered: true,
      address: { line1: '78 Eco Business Park', city: 'Bristol', postcode: 'BS1 5TR', country: 'United Kingdom' },
      industry: 'Renewable Energy',
      employees: 8,
      turnover: 450000,
      yearEnd: '12-31',
      mtditsaStatus: 'NOT_REQUIRED',
      mtditsaEligible: false,
    },
    {
      name: 'Smith & Jones Partnership',
      companyType: 'PARTNERSHIP',
      email: 'accounts@sjpartnership.co.uk',
      phone: '+44 20 7946 9999',
      utr: '1122334455',
      vatNumber: 'GB554433221',
      vatRegistered: true,
      address: { line1: '23 Market Square', city: 'Leeds', postcode: 'LS1 4PL', country: 'United Kingdom' },
      industry: 'Retail',
      employees: 25,
      turnover: 1200000,
      yearEnd: '03-31',
      mtditsaStatus: 'NOT_REQUIRED',
      mtditsaEligible: false,
    },
    {
      name: 'BuildRight Construction Ltd',
      companyType: 'LIMITED_COMPANY',
      email: 'admin@buildright.co.uk',
      phone: '+44 20 7123 4567',
      contact: 'Robert Builder',
      companyNumber: '11223344',
      utr: '9988776655',
      vatNumber: 'GB998877665',
      vatRegistered: true,
      address: { line1: '56 Construction Yard', city: 'Sheffield', postcode: 'S1 2AB', country: 'United Kingdom' },
      industry: 'Construction',
      employees: 45,
      turnover: 2800000,
      yearEnd: '06-30',
      mtditsaStatus: 'NOT_REQUIRED',
      mtditsaEligible: false,
    },
    {
      name: 'Emma Wilson Design Studio',
      companyType: 'SOLE_TRADER',
      email: 'emma@ewdesign.co.uk',
      phone: '+44 20 8765 4321',
      utr: '5566778899',
      vatRegistered: false,
      address: { line1: '89 Creative Lane', city: 'Brighton', postcode: 'BN1 3FD', country: 'United Kingdom' },
      industry: 'Design',
      employees: 2,
      turnover: 45000,
      yearEnd: '04-05',
      mtditsaStatus: 'NOT_REQUIRED',
      mtditsaEligible: false,
    },
    {
      name: 'Property Investments NW Ltd',
      companyType: 'LIMITED_COMPANY',
      email: 'info@propertynw.co.uk',
      phone: '+44 161 555 7890',
      contact: 'David Landlord',
      companyNumber: '55667788',
      utr: '3344556677',
      vatNumber: 'GB334455667',
      vatRegistered: true,
      address: { line1: '34 Property Plaza', city: 'Liverpool', postcode: 'L3 5QQ', country: 'United Kingdom' },
      industry: 'Property Investment',
      employees: 3,
      turnover: 320000,
      yearEnd: '04-05',
      mtditsaStatus: 'REQUIRED_2027',
      mtditsaIncome: 320000,
      mtditsaEligible: true,
    },
    {
      name: 'The Coffee House Group Ltd',
      companyType: 'LIMITED_COMPANY',
      email: 'manager@coffeehousegroup.co.uk',
      phone: '+44 20 9999 8888',
      contact: 'Lisa Barista',
      companyNumber: '88776655',
      utr: '2233445566',
      vatNumber: 'GB223344556',
      vatRegistered: true,
      address: { line1: '12 High Street', city: 'Glasgow', postcode: 'G1 1AA', country: 'United Kingdom' },
      industry: 'Hospitality',
      employees: 35,
      turnover: 950000,
      yearEnd: '03-31',
      mtditsaStatus: 'NOT_REQUIRED',
      mtditsaEligible: false,
    },
  ];

  const clients = await Promise.all(
    clientsData.map((client) =>
      prisma.client.create({
        data: {
          tenantId: demoTenant.id,
          name: client.name,
          companyType: client.companyType,
          contactEmail: client.email,
          contactPhone: client.phone,
          contactName: client.contact || null,
          companyNumber: client.companyNumber || null,
          utr: client.utr,
          vatNumber: client.vatNumber || null,
          vatRegistered: client.vatRegistered,
          address: JSON.stringify(client.address),
          industry: client.industry,
          employeeCount: client.employees,
          turnover: client.turnover,
          yearEnd: client.yearEnd,
          mtditsaStatus: client.mtditsaStatus,
          mtditsaIncome: client.mtditsaIncome || null,
          mtditsaEligible: client.mtditsaEligible,
          isActive: true,
        },
      })
    )
  );

  console.log('✅ Created clients:', clients.length);

  // Create proposals
  const proposalsData = [
    {
      clientId: clients[0].id,
      createdById: adminUser.id,
      reference: 'PROP-2024-001',
      title: 'Annual Compliance Package 2024/25',
      status: 'ACCEPTED',
      subtotal: 2850,
      discount: 0,
      vat: 570,
      total: 3420,
      services: [
        { serviceId: services[0].id, name: 'Annual Accounts Preparation', qty: 1, price: 750 },
        { serviceId: services[1].id, name: 'Corporation Tax Return', qty: 1, price: 600 },
        { serviceId: services[4].id, name: 'VAT Return', qty: 4, price: 150 },
        { serviceId: services[5].id, name: 'Payroll Processing', qty: 12, price: 25 },
      ],
    },
    {
      clientId: clients[1].id,
      createdById: managerUser.id,
      reference: 'PROP-2024-002',
      title: 'MTD ITSA Transition Package',
      status: 'ACCEPTED',
      subtotal: 850,
      discount: 50,
      vat: 160,
      total: 960,
      services: [
        { serviceId: services[3].id, name: 'Self Assessment', qty: 1, price: 250 },
        { serviceId: services[8].id, name: 'MTD ITSA Quarterly', qty: 4, price: 100 },
        { serviceId: services[9].id, name: 'MTD Transition Support', qty: 1, price: 200 },
      ],
    },
    {
      clientId: clients[4].id,
      createdById: seniorUser.id,
      reference: 'PROP-2024-003',
      title: 'Construction Industry Package',
      status: 'SENT',
      subtotal: 4200,
      discount: 200,
      vat: 800,
      total: 4800,
      services: [
        { serviceId: services[0].id, name: 'Annual Accounts', qty: 1, price: 1200 },
        { serviceId: services[1].id, name: 'Corporation Tax', qty: 1, price: 800 },
        { serviceId: services[6].id, name: 'CIS Returns', qty: 12, price: 100 },
        { serviceId: services[5].id, name: 'Payroll', qty: 45, price: 25 },
      ],
    },
    {
      clientId: clients[6].id,
      createdById: adminUser.id,
      reference: 'PROP-2024-004',
      title: 'Property Investment Services',
      status: 'DRAFT',
      subtotal: 1800,
      discount: 0,
      vat: 360,
      total: 2160,
      services: [
        { serviceId: services[3].id, name: 'Self Assessment', qty: 1, price: 350 },
        { serviceId: services[24].id, name: 'Property Tax Advisory', qty: 1, price: 1200 },
        { serviceId: services[12].id, name: 'Bookkeeping', qty: 12, price: 200 },
      ],
    },
    {
      clientId: clients[7].id,
      createdById: managerUser.id,
      reference: 'PROP-2024-005',
      title: 'Hospitality Full Service Package',
      status: 'VIEWED',
      subtotal: 5500,
      discount: 500,
      vat: 1000,
      total: 6000,
      services: [
        { serviceId: services[0].id, name: 'Annual Accounts', qty: 1, price: 950 },
        { serviceId: services[1].id, name: 'Corporation Tax', qty: 1, price: 750 },
        { serviceId: services[4].id, name: 'VAT Return', qty: 4, price: 175 },
        { serviceId: services[5].id, name: 'Payroll', qty: 35, price: 25 },
        { serviceId: services[13].id, name: 'Management Accounts', qty: 4, price: 400 },
      ],
    },
  ];

  const createdProposals = [];
  for (const proposal of proposalsData) {
    const created = await prisma.proposal.create({
      data: {
        tenantId: demoTenant.id,
        clientId: proposal.clientId,
        createdById: proposal.createdById,
        reference: proposal.reference,
        title: proposal.title,
        status: proposal.status,
        validUntil: new Date('2024-12-31'),
        subtotal: proposal.subtotal,
        discountAmount: proposal.discount,
        vatAmount: proposal.vat,
        total: proposal.total,
        paymentTerms: '30 days',
        paymentFrequency: 'MONTHLY',
        coverLetter: `Dear valued client,\n\nWe are pleased to present this proposal for your accounting and compliance needs. This comprehensive package has been tailored specifically for your business.\n\nBest regards,\nThe Team`,
      },
    });

    // Add proposal services
    await Promise.all(
      proposal.services.map((svc) =>
        prisma.proposalService.create({
          data: {
            proposalId: created.id,
            serviceTemplateId: svc.serviceId,
            name: svc.name,
            quantity: svc.qty,
            unitPrice: svc.price,
            total: svc.qty * svc.price,
            frequency: 'MONTHLY',
          },
        })
      )
    );

    createdProposals.push(created);
  }

  console.log('✅ Created proposals:', createdProposals.length);

  console.log('\n🎉 Enhanced database seeding completed!');
  console.log('\nDemo credentials:');
  console.log('  Email: admin@demo.practice');
  console.log('  Password: DemoPass123!');
  console.log('\nSeed Summary:');
  console.log(`  • ${services.length} service templates`);
  console.log(`  • ${clients.length} clients`);
  console.log(`  • ${createdProposals.length} proposals`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
