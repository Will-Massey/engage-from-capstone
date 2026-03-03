import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ 
    where: { email: 'admin@demo.practice' },
    include: { tenant: true }
  });
  
  console.log('User found:', !!user);
  console.log('User email:', user?.email);
  console.log('User tenantId:', user?.tenantId);
  console.log('User isActive:', user?.isActive);
  console.log('Password hash exists:', !!user?.passwordHash);
  
  // Test password verification
  if (user?.passwordHash) {
    const isValid = await bcrypt.compare('DemoPass123!', user.passwordHash);
    console.log('Password valid:', isValid);
  }
  
  await prisma.$disconnect();
}

main();
