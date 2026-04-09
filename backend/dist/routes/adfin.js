"use strict";
/**
 * Adfin Payment Routes
 * Handles payment collection and webhooks
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_2 = __importDefault(require("express"));
const zod_1 = require("zod");
const auth_js_1 = require("../middleware/auth.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const adfin_js_1 = require("../services/adfin.js");
const database_js_1 = require("../config/database.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
const router = (0, express_1.Router)();
// Helper to check if Adfin is configured
const checkAdfin = () => {
    const service = (0, adfin_js_1.createAdfinService)();
    if (!service) {
        throw new errorHandler_js_1.ApiError('ADFIN_NOT_CONFIGURED', 'Payment collection via Adfin is not configured. Please contact support.', 503);
    }
    return service;
};
/**
 * GET /api/payments/adfin/config
 * Get Adfin configuration status
 */
router.get('/config', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
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
}));
/**
 * POST /api/payments/adfin/create
 * Create a payment request for a proposal
 */
router.post('/create', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const adfin = checkAdfin();
    const schema = zod_1.z.object({
        proposalId: zod_1.z.string(),
        allowCard: zod_1.z.boolean().default(true),
        allowOpenBanking: zod_1.z.boolean().default(true),
        allowDirectDebit: zod_1.z.boolean().default(true),
    });
    const { proposalId, allowCard, allowOpenBanking, allowDirectDebit } = schema.parse(req.body);
    // Get proposal details
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id: proposalId,
            tenantId: req.tenantId,
        },
        include: {
            client: true,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }
    if (proposal.status === 'ACCEPTED') {
        throw new errorHandler_js_1.ApiError('ALREADY_PAID', 'This proposal has already been paid', 400);
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
            tenantId: req.tenantId,
            clientId: proposal.clientId,
        },
        allowCard,
        allowOpenBanking,
        allowDirectDebit,
    });
    // Store payment reference in proposal
    await database_js_1.prisma.proposal.update({
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
}));
/**
 * GET /api/payments/adfin/status/:proposalId
 * Get payment status for a proposal
 */
router.get('/status/:proposalId', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { proposalId } = req.params;
    const proposal = await database_js_1.prisma.proposal.findFirst({
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
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
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
        }
        catch (error) {
            logger_js_1.default.error('Failed to get Adfin status:', error);
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
}));
/**
 * POST /api/payments/adfin/cancel
 * Cancel a pending payment
 */
router.post('/cancel', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN', 'PARTNER', 'MANAGER'), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const adfin = checkAdfin();
    const schema = zod_1.z.object({
        proposalId: zod_1.z.string(),
    });
    const { proposalId } = schema.parse(req.body);
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id: proposalId,
            tenantId: req.tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }
    if (!proposal.paymentId) {
        throw new errorHandler_js_1.ApiError('NO_PAYMENT', 'No payment to cancel', 400);
    }
    await adfin.cancelPayment(proposal.paymentId);
    await database_js_1.prisma.proposal.update({
        where: { id: proposalId },
        data: {
            paymentStatus: 'CANCELLED',
        },
    });
    res.json({
        success: true,
        message: 'Payment cancelled successfully',
    });
}));
/**
 * POST /api/payments/adfin/webhook
 * Handle Adfin webhooks (public endpoint)
 */
router.post('/webhook', express_2.default.raw({ type: 'application/json' }), (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const signature = req.headers['x-adfin-signature'];
    if (!signature) {
        throw new errorHandler_js_1.ApiError('MISSING_SIGNATURE', 'Webhook signature missing', 400);
    }
    const adfin = checkAdfin();
    const payload = req.body;
    // Verify signature
    if (!adfin.verifyWebhookSignature(payload, signature)) {
        throw new errorHandler_js_1.ApiError('INVALID_SIGNATURE', 'Invalid webhook signature', 401);
    }
    const event = JSON.parse(payload);
    // Process webhook
    await adfin.processWebhook(event);
    res.json({ success: true });
}));
exports.default = router;
//# sourceMappingURL=adfin.js.map