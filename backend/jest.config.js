/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src', '<rootDir>/../shared/src'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/src/$1',
  },
  setupFiles: ['<rootDir>/tests/env.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/__tests__/'],
  maxWorkers: 1,
  // Coverage memory control: babel-instrumented coverage maps accumulate in
  // the single worker across 30+ suites and OOM'd CI. V8 coverage is native
  // and far lighter; the idle-memory limit recycles the worker if it bloats.
  coverageProvider: 'v8',
  workerIdleMemoryLimit: '1.5GB',
};
