const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const services = await prisma.serviceTemplate.findMany({
      where: { tenantId: 'c64b3280-4ea0-4975-a363-4d73920b92ad' },
      select: { id: true, name: true, isActive: true }
    });
    console.log('Services found:', services.length);
    console.log(JSON.stringify(services, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma['$disconnect']();
  }
}

check();
