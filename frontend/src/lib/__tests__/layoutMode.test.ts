import { describe, expect, it } from 'vitest';
import { layoutMode } from '../layoutMode';

describe('layoutMode', () => {
  it('keeps phones on the compact chrome, including landscape', () => {
    expect(layoutMode(390, 844)).toBe('compact');
    expect(layoutMode(430, 932)).toBe('compact');
    expect(layoutMode(932, 430)).toBe('compact');
    expect(layoutMode(844, 390)).toBe('compact');
  });

  it('uses the adaptive chrome on iPad portrait and landscape', () => {
    expect(layoutMode(768, 1024)).toBe('regular');
    expect(layoutMode(834, 1194)).toBe('regular');
    expect(layoutMode(1024, 1366)).toBe('regular');
    expect(layoutMode(1194, 834)).toBe('regular');
    expect(layoutMode(1366, 1024)).toBe('regular');
  });

  it('keeps a phone layout on small Android screens and adapts large ones', () => {
    expect(layoutMode(360, 800)).toBe('compact');
    expect(layoutMode(412, 915)).toBe('compact');
    expect(layoutMode(800, 1280)).toBe('regular');
    expect(layoutMode(1280, 800)).toBe('regular');
  });

  it('treats a desktop window as regular even when it is short', () => {
    expect(layoutMode(1280, 500)).toBe('regular');
    expect(layoutMode(1440, 900)).toBe('regular');
  });
});
