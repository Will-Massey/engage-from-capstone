const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const services = await prisma.serviceTemplate.findMany({
      where: { tenantId: 'c64b3280-4ea0-4975-a363-4d73920b92ad' },
      take: 2,
      select: { 
        id: true, 
        name: true, 
        basePrice: true,
        category: true,
        billingCycle: true,
        defaultFrequency: true
      }
    });
    console.log(JSON.stringify(services, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma['$disconnect']();
  }
}

check();
