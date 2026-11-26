import { ApiError } from '../../middleware/errorHandler.js';

const SIGNED_CONTENT_STATUSES = new Set(['SENT', 'VIEWED']);

/**
 * PUT /proposals/:id must not set status. Lifecycle routes own status.
 * It must not change the content of a sent or viewed proposal that has any signature.
 */
export function assertStaffContentUpdate(input: {
  currentStatus: string;
  requestedStatus: string | undefined;
  signatureCount: number;
  legacySignature: string | null | undefined;
  changesContent: boolean;
}): void {
  if (input.requestedStatus !== undefined && input.requestedStatus !== input.currentStatus) {
    throw new ApiError(
      'STATUS_NOT_SETTABLE',
      'Status cannot be set from this screen. Send, withdraw, archive, and the other status changes have their own actions.',
      400
    );
  }
  const signed =
    input.signatureCount > 0 ||
    (typeof input.legacySignature === 'string' && input.legacySignature.trim().length > 0);
  if (SIGNED_CONTENT_STATUSES.has(input.currentStatus) && signed && input.changesContent) {
    throw new ApiError(
      'SIGNED_PROPOSAL',
      'This proposal has a signature. Its content cannot be edited while it is sent or viewed.',
      409
    );
  }
}
