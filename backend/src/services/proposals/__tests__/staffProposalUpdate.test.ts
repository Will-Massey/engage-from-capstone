import { ApiError } from '../../../middleware/errorHandler.js';
import { assertStaffContentUpdate } from '../staffProposalUpdate.js';

describe('staff proposal update', () => {
  it('refuses a free status change', () => {
    expect(() =>
      assertStaffContentUpdate({
        currentStatus: 'DRAFT',
        requestedStatus: 'SENT',
        signatureCount: 0,
        legacySignature: null,
        changesContent: false,
      })
    ).toThrow(ApiError);
    try {
      assertStaffContentUpdate({
        currentStatus: 'DRAFT',
        requestedStatus: 'ACCEPTED',
        signatureCount: 0,
        legacySignature: null,
        changesContent: false,
      });
    } catch (err) {
      expect((err as ApiError).code).toBe('STATUS_NOT_SETTABLE');
    }
  });

  it('allows the same status to be echoed and still edits an unsigned sent proposal', () => {
    expect(() =>
      assertStaffContentUpdate({
        currentStatus: 'SENT',
        requestedStatus: 'SENT',
        signatureCount: 0,
        legacySignature: null,
        changesContent: true,
      })
    ).not.toThrow();
  });

  it('refuses content changes on a signed sent or viewed proposal', () => {
    for (const currentStatus of ['SENT', 'VIEWED']) {
      expect(() =>
        assertStaffContentUpdate({
          currentStatus,
          requestedStatus: undefined,
          signatureCount: 1,
          legacySignature: null,
          changesContent: true,
        })
      ).toThrow(/signature/i);
      expect(() =>
        assertStaffContentUpdate({
          currentStatus,
          requestedStatus: undefined,
          signatureCount: 0,
          legacySignature: 'signed',
          changesContent: true,
        })
      ).toThrow(/signature/i);
    }
  });
});
