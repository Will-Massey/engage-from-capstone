import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Creating simple demo data...');

  // Create demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo-practice' },
    update: {},
    create: {
      name: 'Smith & Associates Accounting',
      slug: 'demo-practice',
      email: 'contact@smithaccounting.co.uk',
      phone: '+44 20 7123 4567',
      address: '123 Business Street, London, EC1A 1BB',
      website: 'https://smithaccounting.co.uk',
      subscriptionTier: 'PROFESSIONAL',
      subscriptionStatus: 'ACTIVE',
      emailQuota: 1000,
      storageQuota: 5368709120, // 5GB
    },
  });
  console.log('✅ Created demo tenant:', tenant.name);

  // Create admin user
  const hashedPassword = await bcrypt.hash('DemoPass123!', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@demo.practice' },
    update: {},
    create: {
      email: 'admin@demo.practice',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      tenantId: tenant.id,
      isActive: true,
      emailVerified: true,
    },
  });
  console.log('✅ Created admin user:', admin.email);

  console.log('\n🎉 Demo data created successfully!');
  console.log('\nLogin credentials:');
  console.log('  Email: admin@demo.practice');
  console.log('  Password: DemoPass123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
