process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-minimum-32-characters-long';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/engage_test';
process.env.DEFAULT_TENANT_SUBDOMAIN =
  process.env.DEFAULT_TENANT_SUBDOMAIN || 'demo';
