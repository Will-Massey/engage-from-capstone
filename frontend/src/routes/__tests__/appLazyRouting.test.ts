import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('App.tsx route splitting', () => {
  it('does not statically import page modules (all routes use lazyPages)', () => {
    const appSource = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');
    expect(appSource).toContain("from './routes/lazyPages'");
    expect(appSource).not.toMatch(/from '\.\/pages\//);
    expect(appSource).toContain('PageSuspense');
  });
});
