import { describe, expect, it } from 'vitest';
import { amlUploadUrlFromPortalUrl } from '../amlUploadLink';

describe('amlUploadUrlFromPortalUrl', () => {
  it('keeps origin, base path and token, swapping /portal/ for /onboarding/aml/', () => {
    expect(amlUploadUrlFromPortalUrl('https://capstonesoftware.co.uk/engage/portal/abc123')).toBe(
      'https://capstonesoftware.co.uk/engage/onboarding/aml/abc123'
    );
    expect(amlUploadUrlFromPortalUrl('http://localhost:5173/portal/tok?x=1')).toBe(
      'http://localhost:5173/onboarding/aml/tok'
    );
  });

  it('returns null for anything that is not a portal URL', () => {
    expect(amlUploadUrlFromPortalUrl('https://example.com/view/abc')).toBeNull();
    expect(amlUploadUrlFromPortalUrl('')).toBeNull();
    expect(amlUploadUrlFromPortalUrl(undefined)).toBeNull();
  });
});
