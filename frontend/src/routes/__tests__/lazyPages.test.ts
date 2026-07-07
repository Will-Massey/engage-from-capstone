import { describe, expect, it } from 'vitest';
import { ROUTE_LAZY_PAGES } from '../lazyPages';

const LAZY_TYPE = Symbol.for('react.lazy');

describe('route lazy pages', () => {
  it('lazy-loads every App route page (no static page imports in App.tsx)', () => {
    expect(Object.keys(ROUTE_LAZY_PAGES).length).toBeGreaterThanOrEqual(30);
    for (const [name, component] of Object.entries(ROUTE_LAZY_PAGES)) {
      expect(component.$$typeof, `${name} should be React.lazy`).toBe(LAZY_TYPE);
    }
  });
});