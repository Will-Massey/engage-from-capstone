/**
 * Database and Deployment Health Check Script
 * Run this to verify the deployed environment is properly configured
 */

import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

async function checkDeployment() {
  logger.info('=== Deployment Health Check ===');

  const checks: { name: string; status: 'pass' | 'fail' | 'warning'; message: string }[] = [];

  try {
    // 1. Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.push({
        name: 'Database Connection',
        status: 'pass',
        message: 'Connected successfully',
      });
    } catch (error: any) {
      checks.push({ name: 'Database Connection', status: 'fail', message: error.message });
    }

    // 2. Check required tables exist
    const requiredTables = [
      'Tenant',
      'User',
      'RefreshToken',
      'Client',
      'Proposal',
      'ServiceTemplate',
    ];

    for (const table of requiredTables) {
      try {
        // Try to count records in each table
        const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM "${table}"`);
        const count = parseInt((result as any)[0].count);
        checks.push({ name: `Table: ${table}`, status: 'pass', message: `${count} records` });
      } catch (error: any) {
        checks.push({ name: `Table: ${table}`, status: 'fail', message: error.message });
      }
    }

    // 3. Check for demo tenant
    try {
      const tenant = await prisma.tenant.findFirst({
        where: { OR: [{ subdomain: 'demo' }, { subdomain: 'demo-practice' }] },
      });
      if (tenant) {
        checks.push({
          name: 'Demo Tenant',
          status: 'pass',
          message: `Found: ${tenant.name} (${tenant.subdomain})`,
        });
      } else {
        checks.push({
          name: 'Demo Tenant',
          status: 'fail',
          message: 'No demo or demo-practice tenant found',
        });
      }
    } catch (error: any) {
      checks.push({ name: 'Demo Tenant', status: 'fail', message: error.message });
    }

    // 4. Check for admin user
    try {
      const adminUser = await prisma.user.findFirst({
        where: { email: { contains: 'admin', mode: 'insensitive' } },
        include: { tenant: true },
      });
      if (adminUser) {
        checks.push({ name: 'Admin User', status: 'pass', message: `Found: ${adminUser.email}` });
      } else {
        checks.push({ name: 'Admin User', status: 'warning', message: 'No admin user found' });
      }
    } catch (error: any) {
      checks.push({ name: 'Admin User', status: 'fail', message: error.message });
    }

    // 5. Check environment variables
    const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'FRONTEND_URL'];
    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        checks.push({ name: `Env: ${envVar}`, status: 'pass', message: 'Set' });
      } else {
        checks.push({ name: `Env: ${envVar}`, status: 'fail', message: 'Not set' });
      }
    }

    // 6. Check enum values
    try {
      const enumResult = await prisma.$queryRaw`
        SELECT e.enumlabel as value
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'UserRole'
      `;
      const values = (enumResult as any[]).map((r) => r.value).join(', ');
      checks.push({ name: 'UserRole Enum', status: 'pass', message: values });
    } catch (error: any) {
      checks.push({ name: 'UserRole Enum', status: 'fail', message: error.message });
    }
  } catch (error: any) {
    logger.error('Health check failed:', error);
  }

  // Print results
  logger.info('\n=== Check Results ===');
  checks.forEach((check) => {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
    logger.info(`${icon} ${check.name}: ${check.message}`);
  });

  const failures = checks.filter((c) => c.status === 'fail');
  const warnings = checks.filter((c) => c.status === 'warning');

  logger.info(`\n=== Summary ===`);
  logger.info(
    `Total: ${checks.length}, Passed: ${checks.length - failures.length - warnings.length}, Warnings: ${warnings.length}, Failed: ${failures.length}`
  );

  if (failures.length > 0) {
    logger.error('\n❌ CRITICAL ISSUES FOUND:');
    failures.forEach((f) => logger.error(`  - ${f.name}: ${f.message}`));
    process.exit(1);
  }

  await prisma.$disconnect();
}

checkDeployment();
