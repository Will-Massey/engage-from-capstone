import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Creating demo data...');

  // Check if tenant exists
  let tenant = await prisma.tenant.findFirst({
    where: { subdomain: 'demo-practice' }
  });

  if (!tenant) {
    // Create tenant
    tenant = await prisma.tenant.create({
      data: {
        name: 'Smith & Associates Accounting',
        subdomain: 'demo-practice',
      },
    });
    console.log('✅ Created tenant:', tenant.id);
  } else {
    console.log('✅ Found existing tenant:', tenant.id);
  }

  // Check if user exists
  const existingUser = await prisma.user.findFirst({
    where: { 
      email: 'admin@demo.practice',
      tenantId: tenant.id
    }
  });

  const hashedPassword = await bcrypt.hash('DemoPass123!', 12);

  if (!existingUser) {
    // Create user
    const user = await prisma.user.create({
      data: {
        email: 'admin@demo.practice',
        passwordHash: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        tenantId: tenant.id,
        role: 'ADMIN',
        isActive: true,
      },
    });
    console.log('✅ Created user:', user.email);
  } else {
    // Update password
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { passwordHash: hashedPassword }
    });
    console.log('✅ Updated user password:', existingUser.email);
  }

  console.log('\n🎉 Done!');
  console.log('Login with:');
  console.log('  Email: admin@demo.practice');
  console.log('  Password: DemoPass123!');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
