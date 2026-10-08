import { describe, expect, it } from 'vitest';
import {
  AML_MAX_FILE_BYTES,
  amlClientStep,
  amlFileProblem,
  amlShowUploadForm,
} from '../amlOnboardingStatus';

describe('client ID / AML upload status', () => {
  it('is "requested" when nothing has been uploaded', () => {
    expect(amlClientStep({ amlStatus: 'NOT_STARTED', amlSubmittedAt: null })).toBe('requested');
    expect(amlClientStep(null)).toBe('requested');
    expect(amlShowUploadForm('requested')).toBe(true);
  });

  it('is "uploaded" once documents are submitted, and hides the form', () => {
    const step = amlClientStep({ amlStatus: 'PENDING', amlSubmittedAt: '2026-10-08T16:00:00Z' });
    expect(step).toBe('uploaded');
    expect(amlShowUploadForm(step)).toBe(false);
  });

  it('is "verified" when the practice marks AML complete', () => {
    expect(amlClientStep({ amlStatus: 'CLEAR', amlCompletedAt: '2026-10-09T09:00:00Z' })).toBe(
      'verified'
    );
    expect(amlClientStep({ amlStatus: 'CLEAR' })).toBe('verified');
  });

  it('asks for a re-upload on REFER / FAILED', () => {
    for (const s of ['REFER', 'FAILED']) {
      const step = amlClientStep({ amlStatus: s, amlSubmittedAt: '2026-10-08T16:00:00Z' });
      expect(step).toBe('resubmit');
      expect(amlShowUploadForm(step)).toBe(true);
    }
  });
});

describe('client ID / AML file checks', () => {
  it('accepts JPEG, PNG, WebP and PDF up to 10 MB', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
      expect(amlFileProblem({ type, size: 1024 })).toBeNull();
    }
    expect(amlFileProblem({ type: 'application/pdf', size: AML_MAX_FILE_BYTES })).toBeNull();
  });

  it('rejects other types, empty files and files over 10 MB', () => {
    expect(amlFileProblem({ type: 'image/heic', size: 1024 })).toMatch(/JPEG, PNG, WebP or PDF/);
    expect(amlFileProblem({ type: 'image/png', size: 0 })).toMatch(/empty/);
    expect(amlFileProblem({ type: 'image/png', size: AML_MAX_FILE_BYTES + 1 })).toMatch(/10 MB/);
  });
});
