import fs from 'fs';
import path from 'path';

/**
 * Guards CI workflow invariants for the money-path test promotion:
 * seeded DB for smoke suites, coverage isolated from full-app smoke runs.
 */
describe('CI workflow guards', () => {
  const workflowPath = path.resolve(__dirname, '../../../.github/workflows/ci-cd.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  it('seeds the test database before backend tests', () => {
    expect(workflow).toContain('Seed test database');
    expect(workflow).toContain('seed-enhanced.ts');
  });

  it('runs unit coverage without smoke suites to avoid heap OOM', () => {
    expect(workflow).toMatch(/testPathIgnorePatterns=\/smoke\//);
    expect(workflow).toContain('test:integration');
  });

  it('raises Node heap for coverage instrumentation', () => {
    expect(workflow).toMatch(/NODE_OPTIONS:.*max-old-space-size/);
  });
});
