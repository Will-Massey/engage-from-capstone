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
  // text-summary only — the default per-file text table on ~13k lines of src/
  // hung CI for 30+ minutes; lcov is what codecov consumes.
  coverageReporters: ['lcov', 'text-summary'],
  maxWorkers: 1,
  coverageProvider: 'v8',
};
