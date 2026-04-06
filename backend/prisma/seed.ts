import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Create demo tenant
  let tenant = await prisma.tenant.findFirst({
    where: { subdomain: 'demo' }
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Demo Accounting Practice',
        subdomain: 'demo',
        primaryColor: '#0ea5e9',
      }
    });
    console.log('✅ Created tenant:', tenant.id);
  } else {
    console.log('ℹ️ Tenant already exists:', tenant.id);
  }

  // Create demo admin user
  const existingUser = await prisma.user.findFirst({
    where: { email: 'admin@demo.practice' }
  });

  if (!existingUser) {
    const user = await prisma.user.create({
      data: {
        email: 'admin@demo.practice',
        passwordHash: await bcrypt.hash('DemoPass123!', 12),
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        tenantId: tenant.id,
        isActive: true,
      }
    });
    console.log('✅ Created demo user:', user.email);
  } else {
    console.log('ℹ️ Demo user already exists');
  }

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
