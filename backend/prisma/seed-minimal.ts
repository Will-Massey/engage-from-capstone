import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Creating minimal demo data...');

  try {
    // Create demo tenant with minimal fields
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Demo Practice',
        subdomain: 'demo',
      },
    });
    console.log('✅ Created tenant:', tenant.id);

    // Create admin user with minimal fields
    const hashedPassword = await bcrypt.hash('DemoPass123!', 12);
    
    const user = await prisma.user.create({
      data: {
        email: 'admin@demo.practice',
        passwordHash: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        tenantId: tenant.id,
      },
    });
    console.log('✅ Created user:', user.email);

    console.log('\n🎉 Demo data created!');
    console.log('Login: admin@demo.practice / DemoPass123!');
  } catch (error) {
    console.error('Error creating data:', error);
    // If data already exists, just log it
    console.log('Data may already exist, continuing...');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
