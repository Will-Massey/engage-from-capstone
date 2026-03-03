import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { subdomain: 'demo' } });
  console.log('Tenant ID:', tenant?.id);
  console.log('Tenant Name:', tenant?.name);
  
  const user = await prisma.user.findFirst({ where: { email: 'admin@demo.practice' } });
  console.log('User Email:', user?.email);
  console.log('User TenantId:', user?.tenantId);
  
  await prisma.$disconnect();
}

main();
