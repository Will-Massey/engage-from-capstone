/**
 * Client-facing status for the ID / AML self-service upload page
 * (/onboarding/aml/:token). Pure so it can be unit tested.
 *
 *  requested    → the practice has sent the link; nothing uploaded yet
 *  uploaded     → documents received, awaiting the practice's review
 *  verified     → the practice (or a provider) has marked AML complete
 *  resubmit     → the practice needs the documents again (REFER / FAILED)
 */
export type AmlClientStep = 'requested' | 'uploaded' | 'verified' | 'resubmit';

export interface AmlClientStatusInput {
  amlStatus?: string | null;
  amlSubmittedAt?: string | null;
  amlCompletedAt?: string | null;
}

export function amlClientStep(ctx: AmlClientStatusInput | null | undefined): AmlClientStep {
  if (!ctx) return 'requested';
  if (ctx.amlCompletedAt || ctx.amlStatus === 'CLEAR') return 'verified';
  if (ctx.amlStatus === 'REFER' || ctx.amlStatus === 'FAILED') return 'resubmit';
  if (ctx.amlSubmittedAt) return 'uploaded';
  return 'requested';
}

/** Whether the upload form should be shown (rather than the status screen). */
export function amlShowUploadForm(step: AmlClientStep): boolean {
  return step === 'requested' || step === 'resubmit';
}

export const AML_CLIENT_STEPS: Array<{
  key: 'requested' | 'uploaded' | 'verified';
  label: string;
}> = [
  { key: 'requested', label: 'Requested' },
  { key: 'uploaded', label: 'Uploaded' },
  { key: 'verified', label: 'Reviewed and verified' },
];

export const AML_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const AML_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Returns an error message for an unacceptable file, or null when it is fine. */
export function amlFileProblem(file: { type: string; size: number }): string | null {
  if (!AML_ACCEPTED_TYPES.includes(file.type)) {
    return 'Please upload a JPEG, PNG, WebP or PDF file.';
  }
  if (file.size <= 0) return 'That file is empty. Please choose another.';
  if (file.size > AML_MAX_FILE_BYTES) return 'Each file must be 10 MB or smaller.';
  return null;
}
