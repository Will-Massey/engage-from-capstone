import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function testLogin() {
  const email = 'admin@demo.practice';
  const password = 'DemoPass123!';
  const tenantId = '5f0fe3cb-ab5d-4ecd-ad4a-2dd6fc75e3de';
  
  console.log('Testing login with:');
  console.log('  Email:', email);
  console.log('  TenantId:', tenantId);
  
  const user = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      tenantId: tenantId,
      isActive: true,
    },
  });
  
  console.log('User found:', !!user);
  
  if (user) {
    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log('Password valid:', isValid);
  } else {
    // Check if user exists without tenant filter
    const userNoTenant = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
    });
    console.log('User exists (no tenant filter):', !!userNoTenant);
    if (userNoTenant) {
      console.log('  User tenantId:', userNoTenant.tenantId);
      console.log('  Expected tenantId:', tenantId);
      console.log('  Match:', userNoTenant.tenantId === tenantId);
    }
  }
  
  await prisma.$disconnect();
}

testLogin();
