import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  consumePendingNativeDeepLink,
  emitNativeDeepLink,
  handleNativeOpenUrl,
  lastClientDeepLink,
  parseNativeOpenUrl,
  rememberClientDeepLink,
} from '../nativeDeepLinks';

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
});

afterEach(() => {
  consumePendingNativeDeepLink();
});

describe('parseNativeOpenUrl', () => {
  it('strips the production /engage prefix from https portal links', () => {
    expect(parseNativeOpenUrl('https://capstonesoftware.co.uk/engage/portal/tok-1')).toBe(
      '/portal/tok-1'
    );
  });

  it('keeps proposal, letter, and AML public paths', () => {
    expect(parseNativeOpenUrl('https://capstonesoftware.co.uk/engage/proposals/view/abc')).toBe(
      '/proposals/view/abc'
    );
    expect(parseNativeOpenUrl('https://capstonesoftware.co.uk/engage/letters/view/abc')).toBe(
      '/letters/view/abc'
    );
    expect(parseNativeOpenUrl('https://capstonesoftware.co.uk/engage/onboarding/aml/abc')).toBe(
      '/onboarding/aml/abc'
    );
  });

  it('parses the engage:// custom scheme', () => {
    expect(parseNativeOpenUrl('engage://portal/tok-2')).toBe('/portal/tok-2');
    expect(parseNativeOpenUrl('engage://localhost/portal/tok-3')).toBe('/portal/tok-3');
    expect(parseNativeOpenUrl('engage:///proposals/view/tok-4')).toBe('/proposals/view/tok-4');
  });

  it('accepts an already-relative client path', () => {
    expect(parseNativeOpenUrl('/portal/pasted-token')).toBe('/portal/pasted-token');
  });

  it('rejects staff and unknown URLs', () => {
    expect(parseNativeOpenUrl('https://capstonesoftware.co.uk/engage/login')).toBeNull();
    expect(parseNativeOpenUrl('https://capstonesoftware.co.uk/engage/jobs')).toBeNull();
    expect(parseNativeOpenUrl('https://example.com/portal/x')).toBe('/portal/x');
    expect(parseNativeOpenUrl('not a url')).toBeNull();
    expect(parseNativeOpenUrl('/portal/')).toBeNull();
  });
});

describe('last client deep link', () => {
  it('remembers a portal path for reopen', () => {
    rememberClientDeepLink('/portal/keep-me');
    expect(lastClientDeepLink()).toBe('/portal/keep-me');
  });
});

describe('pending deep link queue', () => {
  it('holds a path until React mounts', () => {
    emitNativeDeepLink('/portal/queued');
    expect(consumePendingNativeDeepLink()).toBe('/portal/queued');
    expect(consumePendingNativeDeepLink()).toBeNull();
  });
});

describe('handleNativeOpenUrl', () => {
  it('queues a production portal URL and remembers it for reopen', () => {
    expect(handleNativeOpenUrl('https://capstonesoftware.co.uk/engage/portal/tok-live')).toBe(
      '/portal/tok-live'
    );
    expect(lastClientDeepLink()).toBe('/portal/tok-live');
    expect(consumePendingNativeDeepLink()).toBe('/portal/tok-live');
  });

  it('ignores staff URLs so the tab shell is not hijacked', () => {
    expect(handleNativeOpenUrl('https://capstonesoftware.co.uk/engage/jobs')).toBeNull();
    expect(lastClientDeepLink()).toBeNull();
  });
});
