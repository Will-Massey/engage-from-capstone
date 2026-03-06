// Simple script to create a test user
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  try {
    // Check if tenant exists
    let tenant = await prisma.tenant.findFirst({
      where: { subdomain: 'demo' }
    });

    if (!tenant) {
      console.log('Creating demo tenant...');
      tenant = await prisma.tenant.create({
        data: {
          name: 'Demo Practice',
          subdomain: 'demo',
          companyName: 'Demo Accounting Practice Ltd',
          status: 'ACTIVE',
        }
      });
    }
    console.log('Tenant:', tenant.id);

    // Check if user exists
    let user = await prisma.user.findFirst({
      where: { email: 'admin@demo.practice' }
    });

    if (!user) {
      console.log('Creating test user...');
      const passwordHash = await bcrypt.hash('DemoPass123!', 10);
      user = await prisma.user.create({
        data: {
          email: 'admin@demo.practice',
          passwordHash,
          firstName: 'Admin',
          lastName: 'User',
          role: 'ADMIN',
          tenantId: tenant.id,
          isActive: true,
        }
      });
      console.log('User created:', user.id);
    } else {
      console.log('User already exists:', user.id);
      // Update password
      const passwordHash = await bcrypt.hash('DemoPass123!', 10);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, isActive: true }
      });
      console.log('Password updated');
    }

    console.log('\n✅ Test user ready:');
    console.log('Email: admin@demo.practice');
    console.log('Password: DemoPass123!');
    console.log('Tenant ID:', tenant.id);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
