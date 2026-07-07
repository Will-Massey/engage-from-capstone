import { execSync } from 'child_process';
import path from 'path';

/**
 * Worker lives outside npm workspaces — run its node:test suite from CI.
 */
describe('engage-proxy edge cache policy', () => {
  it('passes cache header unit tests', () => {
    const testFile = path.resolve(
      __dirname,
      '../../../workers/engage-proxy/src/cachePolicy.test.js'
    );
    execSync(`node --test "${testFile}"`, { stdio: 'pipe', encoding: 'utf8' });
  });
});
