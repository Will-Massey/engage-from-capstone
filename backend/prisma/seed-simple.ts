import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting simple database seed...');

  // Clean existing data (in correct order)
  await prisma.$transaction([
    prisma.proposalSignature.deleteMany(),
    prisma.proposalView.deleteMany(),
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
      vatRegistered: true,
      vatNumber: 'GB123456789',
      defaultVatRate: 'STANDARD_20',
      settings: JSON.stringify({
        defaultCurrency: 'GBP',
        defaultPaymentTerms: 30,
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
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      isActive: true,
      tenantId: demoTenant.id,
    },
  });

  console.log('✅ Created admin user:', adminUser.email);
  console.log('   Password: DemoPass123!');

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
