/**
 * Adfin Payment Routes
 * Handles payment collection and webhooks
 */

import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { createAdfinService } from '../services/adfin.js';
import { prisma } from '../config/database.js';
import logger from '../config/logger.js';

const router = Router();

// Helper to check if Adfin is configured
const checkAdfin = () => {
  const service = createAdfinService();
  if (!service) {
    throw new ApiError(
      'ADFIN_NOT_CONFIGURED',
      'Payment collection via Adfin is not configured. Please contact support.',
      503
    );
  }
  return service;
};

/**
 * GET /api/payments/adfin/config
 * Get Adfin configuration status
 */
router.get(
  '/config',
  authenticate,
  asyncHandler(async (req, res) => {
    const isConfigured = !!process.env.ADFIN_API_KEY;
    
    res.json({
      success: true,
      data: {
        configured: isConfigured,
        paymentMethods: {
          card: true,
          openBanking: true,
          directDebit: true,
        },
      },
    });
  })
);

/**
 * POST /api/payments/adfin/create
 * Create a payment request for a proposal
 */
router.post(
  '/create',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const adfin = checkAdfin();
    
    const schema = z.object({
      proposalId: z.string(),
      allowCard: z.boolean().default(true),
      allowOpenBanking: z.boolean().default(true),
      allowDirectDebit: z.boolean().default(true),
    });

    const { proposalId, allowCard, allowOpenBanking, allowDirectDebit } = schema.parse(req.body);

    // Get proposal details
    const proposal = await prisma.proposal.findFirst({
      where: { 
        id: proposalId,
        tenantId: req.tenantId,
      },
      include: {
        client: true,
      },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    if (proposal.status === 'ACCEPTED') {
      throw new ApiError('ALREADY_PAID', 'This proposal has already been paid', 400);
    }

    // Convert to pence (Adfin uses smallest currency unit)
    const amountInPence = Math.round(proposal.total * 100);

    // Create Adfin payment
    const payment = await adfin.createPayment({
      amount: amountInPence,
      currency: 'GBP',
      description: `Proposal: ${proposal.title}`,
      reference: proposal.reference,
      customer: {
        name: proposal.client.contactName || proposal.client.name,
        email: proposal.client.contactEmail,
        companyName: proposal.client.name,
      },
      metadata: {
        proposalId: proposal.id,
        tenantId: req.tenantId!,
        clientId: proposal.clientId,
      },
      allowCard,
      allowOpenBanking,
      allowDirectDebit,
    });

    // Store payment reference in proposal
    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        paymentId: payment.id,
        paymentStatus: 'PENDING',
        paymentUrl: payment.checkoutUrl,
      },
    });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        checkoutUrl: payment.checkoutUrl,
        status: payment.status,
        expiresAt: payment.expiresAt,
      },
    });
  })
);

/**
 * GET /api/payments/adfin/status/:proposalId
 * Get payment status for a proposal
 */
router.get(
  '/status/:proposalId',
  authenticate,
  asyncHandler(async (req, res) => {
    const { proposalId } = req.params;

    const proposal = await prisma.proposal.findFirst({
      where: { 
        id: proposalId,
        tenantId: req.tenantId,
      },
      select: {
        paymentId: true,
        paymentStatus: true,
        paymentUrl: true,
        status: true,
        total: true,
      },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    // If there's a payment ID, get fresh status from Adfin
    if (proposal.paymentId) {
      try {
        const adfin = checkAdfin();
        const adfinStatus = await adfin.getPayment(proposal.paymentId);
        
        res.json({
          success: true,
          data: {
            status: adfinStatus.status,
            amount: proposal.total,
            paymentUrl: proposal.paymentUrl,
            paid: proposal.status === 'ACCEPTED',
          },
        });
        return;
      } catch (error) {
        logger.error('Failed to get Adfin status:', error);
        // Fall through to return cached status
      }
    }

    res.json({
      success: true,
      data: {
        status: proposal.paymentStatus || 'NOT_STARTED',
        amount: proposal.total,
        paymentUrl: proposal.paymentUrl,
        paid: proposal.status === 'ACCEPTED',
      },
    });
  })
);

/**
 * POST /api/payments/adfin/cancel
 * Cancel a pending payment
 */
router.post(
  '/cancel',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const adfin = checkAdfin();
    
    const schema = z.object({
      proposalId: z.string(),
    });

    const { proposalId } = schema.parse(req.body);

    const proposal = await prisma.proposal.findFirst({
      where: { 
        id: proposalId,
        tenantId: req.tenantId,
      },
    });

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }

    if (!proposal.paymentId) {
      throw new ApiError('NO_PAYMENT', 'No payment to cancel', 400);
    }

    await adfin.cancelPayment(proposal.paymentId);

    await prisma.proposal.update({
      where: { id: proposalId },
      data: {
        paymentStatus: 'CANCELLED',
      },
    });

    res.json({
      success: true,
      message: 'Payment cancelled successfully',
    });
  })
);

/**
 * POST /api/payments/adfin/webhook
 * Handle Adfin webhooks (public endpoint)
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-adfin-signature'] as string;
    
    if (!signature) {
      throw new ApiError('MISSING_SIGNATURE', 'Webhook signature missing', 400);
    }

    const adfin = checkAdfin();
    const payload = req.body as string;

    // Verify signature
    if (!adfin.verifyWebhookSignature(payload, signature)) {
      throw new ApiError('INVALID_SIGNATURE', 'Invalid webhook signature', 401);
    }

    const event = JSON.parse(payload);
    
    // Process webhook
    await adfin.processWebhook(event);

    res.json({ success: true });
  })
);

export default router;
