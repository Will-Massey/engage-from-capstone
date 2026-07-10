const chargesRetrieve = jest.fn();
const transfersCreateReversal = jest.fn(async () => ({ id: 'trr_1' }));
// Default: a fresh, un-reversed transfer. Tests for the dispute-won path
// override with amount_reversed > 0 to represent a completed clawback.
const transfersRetrieve = jest.fn(async () => ({
  id: 'tr_1',
  amount: 9700,
  amount_reversed: 0,
  currency: 'gbp',
  destination: 'acct_1',
}));
const reversedTransfer = {
  id: 'tr_1',
  amount: 9700,
  amount_reversed: 9700,
  currency: 'gbp',
  destination: 'acct_1',
};
const transfersCreate = jest.fn(async () => ({ id: 'tr_2' }));
const disputesList = jest.fn();

const findUnique = jest.fn();
const update = jest.fn(async () => ({}));
const activityCreate = jest.fn(async () => ({}));

jest.mock('../../config/stripe.js', () => ({
  stripe: {
    charges: { retrieve: chargesRetrieve },
    transfers: {
      createReversal: transfersCreateReversal,
      retrieve: transfersRetrieve,
      create: transfersCreate,
    },
    disputes: { list: disputesList },
  },
}));
jest.mock('../../config/logger.js', () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('../../config/database.js', () => ({
  prisma: { proposal: { findUnique, update }, activityLog: { create: activityCreate } },
}));

import {
  handleChargeDisputed,
  handleChargeDisputeClosed,
  handleChargeRefunded,
  reconcileDisputes,
} from '../stripeDisputeService.js';

const chargeWithProposal = {
  id: 'ch_1',
  transfer: 'tr_1',
  payment_intent: { metadata: { proposalId: 'p1', tenantId: 't1' } },
  metadata: {},
};

describe('stripeDisputeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chargesRetrieve.mockResolvedValue(chargeWithProposal);
    findUnique.mockResolvedValue({ id: 'p1', paymentStatus: 'PAID', tenantId: 't1' });
  });

  describe('handleChargeDisputed', () => {
    it('reverses the transfer and marks the proposal DISPUTED', async () => {
      await handleChargeDisputed({ id: 'dp_1', charge: 'ch_1', status: 'needs_response' });
      expect(transfersCreateReversal).toHaveBeenCalledWith(
        'tr_1',
        expect.objectContaining({ refund_application_fee: true }),
        { idempotencyKey: 'dispute-reversal-dp_1' }
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { paymentStatus: 'DISPUTED' } })
      );
      expect(activityCreate).toHaveBeenCalled();
    });

    it('rethrows when the reversal fails so the webhook 500s and Stripe retries', async () => {
      transfersCreateReversal.mockRejectedValueOnce(new Error('stripe down'));
      await expect(
        handleChargeDisputed({ id: 'dp_1', charge: 'ch_1', status: 'needs_response' })
      ).rejects.toThrow('stripe down');
      // Not marked DISPUTED — the retry must re-attempt the reversal.
      expect(update).not.toHaveBeenCalled();
    });

    it('skips the reversal when the transfer is already fully reversed', async () => {
      transfersRetrieve.mockResolvedValueOnce(reversedTransfer);
      await handleChargeDisputed({ id: 'dp_1', charge: 'ch_1', status: 'needs_response' });
      expect(transfersCreateReversal).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { paymentStatus: 'DISPUTED' } })
      );
    });

    it('is idempotent when already DISPUTED', async () => {
      findUnique.mockResolvedValue({ id: 'p1', paymentStatus: 'DISPUTED', tenantId: 't1' });
      await handleChargeDisputed({ id: 'dp_1', charge: 'ch_1' });
      expect(transfersCreateReversal).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('skips when the charge has no proposalId', async () => {
      chargesRetrieve.mockResolvedValue({
        id: 'ch_x',
        transfer: 'tr_x',
        metadata: {},
        payment_intent: null,
      });
      await handleChargeDisputed({ id: 'dp_2', charge: 'ch_x' });
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('handleChargeDisputeClosed', () => {
    beforeEach(() => {
      findUnique.mockResolvedValue({ id: 'p1', paymentStatus: 'DISPUTED', tenantId: 't1' });
    });

    it('rethrows when the re-transfer fails so the webhook 500s and Stripe retries', async () => {
      transfersRetrieve.mockResolvedValueOnce(reversedTransfer);
      transfersCreate.mockRejectedValueOnce(new Error('stripe down'));
      await expect(
        handleChargeDisputeClosed({ id: 'dp_1', charge: 'ch_1', status: 'won' })
      ).rejects.toThrow('stripe down');
      // Still DISPUTED — the retry must re-attempt the re-transfer.
      expect(update).not.toHaveBeenCalled();
    });

    it('re-transfers the practice share and marks PAID when won', async () => {
      transfersRetrieve.mockResolvedValueOnce(reversedTransfer);
      await handleChargeDisputeClosed({ id: 'dp_1', charge: 'ch_1', status: 'won' });
      expect(transfersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 9700, destination: 'acct_1' }),
        { idempotencyKey: 'dispute-won-dp_1' }
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { paymentStatus: 'PAID' } })
      );
    });

    it('keeps funds recovered and marks DISPUTE_LOST when lost', async () => {
      await handleChargeDisputeClosed({ id: 'dp_1', charge: 'ch_1', status: 'lost' });
      expect(transfersCreate).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { paymentStatus: 'DISPUTE_LOST' } })
      );
    });

    it('does not re-transfer on win when the original reversal never happened', async () => {
      // e.g. the reversal at dispute.created failed — the practice kept their
      // share, so paying original.amount again would pay them twice.
      transfersRetrieve.mockResolvedValueOnce({
        id: 'tr_1',
        amount: 9700,
        amount_reversed: 0,
        currency: 'gbp',
        destination: 'acct_1',
      });
      await handleChargeDisputeClosed({ id: 'dp_1', charge: 'ch_1', status: 'won' });
      expect(transfersCreate).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { paymentStatus: 'PAID' } })
      );
    });

    it('only acts on an open dispute', async () => {
      findUnique.mockResolvedValue({ id: 'p1', paymentStatus: 'PAID', tenantId: 't1' });
      await handleChargeDisputeClosed({ id: 'dp_1', charge: 'ch_1', status: 'won' });
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('reconcileDisputes', () => {
    it('re-drives the idempotent handlers across paginated dispute lists', async () => {
      disputesList
        .mockResolvedValueOnce({
          data: [{ id: 'dp_open', charge: 'ch_1', status: 'needs_response' }],
          has_more: true,
        })
        .mockResolvedValueOnce({
          data: [{ id: 'dp_won', charge: 'ch_1', status: 'won' }],
          has_more: false,
        });
      // Open dispute sees PAID → reverses + DISPUTED; won dispute then sees
      // DISPUTED → re-transfers + PAID.
      findUnique
        .mockResolvedValueOnce({ id: 'p1', paymentStatus: 'PAID', tenantId: 't1' })
        .mockResolvedValueOnce({ id: 'p1', paymentStatus: 'DISPUTED', tenantId: 't1' });
      transfersRetrieve.mockResolvedValueOnce({ ...reversedTransfer, amount_reversed: 0 });
      transfersRetrieve.mockResolvedValueOnce(reversedTransfer);

      const result = await reconcileDisputes();

      expect(result).toEqual({ scanned: 2, errors: 0 });
      expect(disputesList).toHaveBeenCalledTimes(2);
      expect(disputesList).toHaveBeenLastCalledWith(
        expect.objectContaining({ starting_after: 'dp_open' })
      );
      expect(transfersCreateReversal).toHaveBeenCalledTimes(1);
      expect(transfersCreate).toHaveBeenCalledTimes(1);
    });

    it('counts per-dispute errors without aborting the sweep', async () => {
      disputesList.mockResolvedValueOnce({
        data: [
          { id: 'dp_bad', charge: 'ch_1', status: 'needs_response' },
          { id: 'dp_open', charge: 'ch_1', status: 'needs_response' },
        ],
        has_more: false,
      });
      transfersCreateReversal.mockRejectedValueOnce(new Error('boom'));

      const result = await reconcileDisputes();

      expect(result).toEqual({ scanned: 2, errors: 1 });
      // The second dispute still got processed.
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { paymentStatus: 'DISPUTED' } })
      );
    });
  });

  describe('handleChargeRefunded', () => {
    it('logs a partial refund without changing paymentStatus', async () => {
      // charge.refunded fires on partial refunds too — a £40 refund on a £100
      // charge must not mark the proposal fully REFUNDED.
      await handleChargeRefunded({ ...chargeWithProposal, amount: 10000, amount_refunded: 4000 });
      expect(update).not.toHaveBeenCalled();
      expect(activityCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'PAYMENT_PARTIALLY_REFUNDED' }),
        })
      );
    });

    it('marks REFUNDED when the full amount is refunded', async () => {
      await handleChargeRefunded({ ...chargeWithProposal, amount: 10000, amount_refunded: 10000 });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { paymentStatus: 'REFUNDED' } })
      );
    });

    it('marks REFUNDED without reversing the transfer again', async () => {
      await handleChargeRefunded({ ...chargeWithProposal, amount_refunded: 10000 });
      expect(transfersCreateReversal).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { paymentStatus: 'REFUNDED' } })
      );
    });

    it('is idempotent when already REFUNDED', async () => {
      findUnique.mockResolvedValue({ id: 'p1', paymentStatus: 'REFUNDED', tenantId: 't1' });
      await handleChargeRefunded(chargeWithProposal);
      expect(update).not.toHaveBeenCalled();
    });
  });
});
