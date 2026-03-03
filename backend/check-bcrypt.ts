import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const user = await prisma.user.findFirst({ where: { email: 'admin@demo.practice' } });
  
  if (user) {
    console.log('Password hash:', user.passwordHash.substring(0, 30) + '...');
    console.log('Hash length:', user.passwordHash.length);
    
    const testHash = await bcrypt.hash('DemoPass123!', 12);
    console.log('Test hash:', testHash.substring(0, 30) + '...');
    
    const isValid = await bcrypt.compare('DemoPass123!', user.passwordHash);
    console.log('Password valid:', isValid);
  }
  
  await prisma.$disconnect();
}

check();
