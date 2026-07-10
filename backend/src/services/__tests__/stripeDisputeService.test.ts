const chargesRetrieve = jest.fn();
const transfersCreateReversal = jest.fn(async () => ({ id: 'trr_1' }));
const transfersRetrieve = jest.fn(async () => ({
  id: 'tr_1',
  amount: 9700,
  amount_reversed: 9700,
  currency: 'gbp',
  destination: 'acct_1',
}));
const transfersCreate = jest.fn(async () => ({ id: 'tr_2' }));

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
        expect.objectContaining({ refund_application_fee: true })
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { paymentStatus: 'DISPUTED' } })
      );
      expect(activityCreate).toHaveBeenCalled();
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

    it('re-transfers the practice share and marks PAID when won', async () => {
      await handleChargeDisputeClosed({ id: 'dp_1', charge: 'ch_1', status: 'won' });
      expect(transfersCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 9700, destination: 'acct_1' })
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

  describe('handleChargeRefunded', () => {
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
