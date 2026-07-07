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

  it('raises Node heap for unit coverage instrumentation', () => {
    const unitSection =
      workflow.split('Run unit tests with coverage')[1]?.split('Run smoke tests')[0] ?? '';
    expect(unitSection).toMatch(/NODE_OPTIONS:.*max-old-space-size/);
  });

  it('raises Node heap for full-app smoke suites', () => {
    const smokeSection =
      workflow.split('Run smoke tests')[1]?.split('Frontend unit tests')[0] ?? '';
    expect(smokeSection).toMatch(/NODE_OPTIONS:.*max-old-space-size/);
    expect(smokeSection).toContain('--coverage=false');
  });
});
