process.env.NODE_ENV = 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-minimum-32-characters-long';
process.env.DEFAULT_TENANT_SUBDOMAIN =
  process.env.DEFAULT_TENANT_SUBDOMAIN || 'demo';
