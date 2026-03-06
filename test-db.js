const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connected');
    process.exit(0);
  } catch (e) {
    console.error('Database error:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

test();
