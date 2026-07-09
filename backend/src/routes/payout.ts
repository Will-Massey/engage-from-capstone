/**
 * Tenant payout settings — Receive Payments Through Engage (Stripe Connect).
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { prisma } from '../config/database.js';
import { getPayoutSettingsPublic, savePayoutSettings } from '../services/payoutSettingsService.js';
import { startOnboarding } from '../services/stripeConnectService.js';
import { PAYMENT_COLLECTION_TERMS_VERSION } from '../constants/paymentAgreements.js';

const router = Router();

router.get(
  '/settings',
  authenticate,
  asyncHandler(async (req, res) => {
    const data = await getPayoutSettingsPublic(req.tenantId!);
    res.json({ success: true, data });
  })
);

/** Start Stripe Connect hosted onboarding (Account Link). */
router.post(
  '/stripe/onboard',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const base = (
      process.env.APP_URL ||
      process.env.FRONTEND_URL ||
      'https://capstonesoftware.co.uk/engage'
    ).replace(/\/$/, '');
    const returnUrl = `${base}/settings?tab=billing&onboarding=complete`;
    const refreshUrl = `${base}/settings?tab=billing&onboarding=refresh`;
    try {
      const link = await startOnboarding(tenantId, returnUrl, refreshUrl);
      res.json({ success: true, data: link });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start Stripe onboarding';
      if (message === 'STRIPE_NOT_CONFIGURED') {
        throw new ApiError('STRIPE_NOT_CONFIGURED', 'Stripe is not configured', 503);
      }
      throw new ApiError('STRIPE_ONBOARD_FAILED', message, 400);
    }
  })
);

router.put(
  '/settings',
  authenticate,
  authorize('ADMIN', 'PARTNER'),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      enabled: z.boolean().optional(),
      consentAccepted: z.boolean().optional(),
      consentVersion: z.string().optional(),
      payoutMethod: z.enum(['STRIPE_CONNECT']).optional(),
      accountHolderName: z.string().min(2).max(120).optional(),
      collectPaymentAtSign: z.boolean().optional(),
    });

    const body = schema.parse(req.body);
    const tenantId = req.tenantId!;

    try {
      await savePayoutSettings({
        tenantId,
        userId: req.user!.id,
        enabled: body.enabled,
        consentAccepted: body.consentAccepted,
        consentVersion: body.consentVersion,
        consentIp: req.ip,
        payoutMethod: body.payoutMethod,
        accountHolderName: body.accountHolderName,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save payout settings';
      throw new ApiError('PAYOUT_SETTINGS_INVALID', message, 400);
    }

    if (body.collectPaymentAtSign !== undefined) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });
      const current = JSON.parse(tenant?.settings || '{}');
      current.payments = {
        ...(current.payments || {}),
        collectPaymentAtSign: body.collectPaymentAtSign,
        allowDirectDebit: false,
        allowCard: true,
      };
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { settings: JSON.stringify(current) },
      });
    }

    const data = await getPayoutSettingsPublic(tenantId);
    res.json({ success: true, data });
  })
);

router.get(
  '/ledger',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MD'),
  asyncHandler(async (req, res) => {
    const splits = await prisma.paymentSplit.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { paidAt: 'desc' },
      take: 100,
      include: {
        proposal: { select: { reference: true, title: true, clientId: true } },
      },
    });

    res.json({
      success: true,
      data: splits.map((s) => ({
        id: s.id,
        reference: s.proposal.reference,
        title: s.proposal.title,
        grossPence: s.totalPence,
        platformFeePence: s.platformFeePence,
        processingFeePence: s.processorFeePence + s.processorMarkupPence,
        netPayoutPence: s.agencySharePence,
        payoutStatus: s.payoutStatus,
        paidAt: s.paidAt,
        payoutTransferId: s.payoutTransferId,
      })),
    });
  })
);

router.get('/agreements', (_req, res) => {
  res.json({
    success: true,
    data: {
      paymentCollectionTermsVersion: PAYMENT_COLLECTION_TERMS_VERSION,
    },
  });
});

export default router;
