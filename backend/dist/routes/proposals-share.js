"use strict";
/**
 * Proposal Sharing, Tracking, and e-Signature Routes
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const database_js_1 = require("../config/database.js");
const errorHandler_js_1 = require("../middleware/errorHandler.js");
const auth_js_1 = require("../middleware/auth.js");
const tenant_simple_js_1 = require("../middleware/tenant-simple.js");
const ukEngagementLetter_js_1 = require("../templates/ukEngagementLetter.js");
const proposalSharingService_js_1 = require("../services/proposalSharingService.js");
const emailService_js_1 = require("../services/emailService.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
const router = (0, express_1.Router)();
// Apply tenant extraction to all routes
router.use(tenant_simple_js_1.extractTenant);
// Create shareable link for proposal
router.post('/:id/share', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        expiryDays: zod_1.z.number().min(1).max(90).default(30),
    });
    const { expiryDays } = schema.parse(req.body);
    const { id } = req.params;
    const tenantId = req.tenantId;
    const tenant = req.tenant;
    // Verify proposal exists and belongs to tenant
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId,
        },
        include: {
            client: true,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }
    const { token, shareUrl, expiresAt } = await (0, proposalSharingService_js_1.createShareableLink)(id, expiryDays, tenant.subdomain);
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_SHARE_LINK_CREATED',
            entityType: 'PROPOSAL',
            entityId: id,
            description: `Shareable link created for proposal ${proposal.reference}`,
            metadata: JSON.stringify({
                expiresAt,
                shareUrl,
            }),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        },
    });
    res.json({
        success: true,
        data: {
            token,
            shareUrl,
            expiresAt,
            pdfUrl: (0, proposalSharingService_js_1.generateProposalPdfUrl)(token, tenant.subdomain),
        },
    });
}));
// Revoke shareable link
router.delete('/:id/share', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }
    await (0, proposalSharingService_js_1.revokeShareableLink)(id);
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_SHARE_LINK_REVOKED',
            entityType: 'PROPOSAL',
            entityId: id,
            description: `Shareable link revoked for proposal ${proposal.reference}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        },
    });
    res.json({
        success: true,
        message: 'Shareable link revoked',
    });
}));
// Send proposal via email
router.post('/:id/email', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        to: zod_1.z.string().email(),
        cc: zod_1.z.array(zod_1.z.string().email()).optional(),
        subject: zod_1.z.string().optional(),
        message: zod_1.z.string().optional(),
        includePdf: zod_1.z.boolean().default(true),
    });
    const { to, cc, subject, message, includePdf } = schema.parse(req.body);
    const { id } = req.params;
    const tenantId = req.tenantId;
    const tenant = req.tenant;
    // Get proposal
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId,
        },
        include: {
            client: true,
            createdBy: {
                select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                    role: true,
                },
            },
            tenant: {
                select: {
                    name: true,
                },
            },
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }
    // Create or get shareable link
    let shareUrl;
    if (!proposal.shareToken || !proposal.publicAccessEnabled) {
        const result = await (0, proposalSharingService_js_1.createShareableLink)(id, 30, tenant.subdomain);
        shareUrl = result.shareUrl;
    }
    else {
        const baseUrl = process.env.PUBLIC_PROPOSAL_URL || `https://${tenant.subdomain}.engage.capstone.co.uk`;
        shareUrl = `${baseUrl}/proposals/view/${proposal.shareToken}`;
    }
    // Initialize email service
    const emailService = (0, emailService_js_1.createEmailService)();
    if (!emailService) {
        throw new errorHandler_js_1.ApiError('EMAIL_NOT_CONFIGURED', 'Email service not configured', 500);
    }
    // Generate PDF if needed
    let pdfAttachment;
    if (includePdf) {
        // TODO: Generate PDF - for now we'll skip attachment
        // pdfAttachment = await generateProposalPdf(proposal);
    }
    // Send email
    const senderName = `${proposal.createdBy.firstName} ${proposal.createdBy.lastName}`;
    const result = await emailService.sendProposalEmail({
        to,
        clientName: proposal.client.name,
        proposalTitle: proposal.title,
        proposalReference: proposal.reference,
        viewLink: shareUrl,
        senderName,
        senderPosition: proposal.createdBy.role,
        senderEmail: proposal.createdBy.email,
        tenantName: proposal.tenant?.name || 'Unknown',
        validUntil: new Date(proposal.validUntil).toLocaleDateString('en-GB'),
        attachment: pdfAttachment,
    });
    if (!result.success) {
        throw new errorHandler_js_1.ApiError('EMAIL_FAILED', result.error || 'Failed to send email', 500);
    }
    // Update proposal email history
    const emailHistory = JSON.parse(proposal.emailHistory || '[]');
    emailHistory.push({
        sentAt: new Date().toISOString(),
        to,
        cc,
        subject: subject || `Proposal: ${proposal.title}`,
        messageId: result.messageId,
    });
    await database_js_1.prisma.proposal.update({
        where: { id },
        data: {
            lastEmailedAt: new Date(),
            emailHistory: JSON.stringify(emailHistory),
            sentAt: new Date(),
            status: 'SENT',
        },
    });
    // Log activity
    await database_js_1.prisma.activityLog.create({
        data: {
            tenantId,
            userId: req.user.id,
            action: 'PROPOSAL_SENT',
            entityType: 'PROPOSAL',
            entityId: id,
            description: `Proposal sent to ${to}`,
            metadata: JSON.stringify({
                to,
                cc,
                messageId: result.messageId,
            }),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        },
    });
    res.json({
        success: true,
        data: {
            messageId: result.messageId,
            shareUrl,
        },
        message: 'Proposal sent successfully',
    });
}));
// Get proposal view statistics
router.get('/:id/views', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId;
    // Verify proposal exists and belongs to tenant
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }
    const stats = await (0, proposalSharingService_js_1.getProposalViewStats)(id);
    res.json({
        success: true,
        data: stats,
    });
}));
// Get compliance audit trail
router.get('/:id/audit-trail', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId;
    // Verify proposal exists and belongs to tenant
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }
    const auditTrail = await (0, proposalSharingService_js_1.generateComplianceAuditTrail)(id);
    res.json({
        success: true,
        data: auditTrail,
    });
}));
// Get proposal signatures
router.get('/:id/signatures', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId;
    // Verify proposal exists and belongs to tenant
    const proposal = await database_js_1.prisma.proposal.findFirst({
        where: {
            id,
            tenantId,
        },
    });
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found', 404);
    }
    const signatures = await (0, proposalSharingService_js_1.getProposalSignatures)(id);
    res.json({
        success: true,
        data: signatures,
    });
}));
// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================
// View proposal by share token (public)
router.get('/view/:token', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { token } = req.params;
    const proposal = await (0, proposalSharingService_js_1.getProposalByShareToken)(token);
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }
    // Track view
    await (0, proposalSharingService_js_1.trackProposalView)(proposal.id, req.ip || null, req.headers['user-agent'] || null);
    // Return proposal data (without sensitive fields)
    res.json({
        success: true,
        data: {
            id: proposal.id,
            reference: proposal.reference,
            title: proposal.title,
            status: proposal.status,
            validUntil: proposal.validUntil,
            subtotal: proposal.subtotal,
            vatAmount: proposal.vatAmount,
            total: proposal.total,
            paymentTerms: proposal.paymentTerms,
            coverLetter: proposal.coverLetter,
            terms: proposal.terms,
            engagementLetter: proposal.engagementLetter,
            client: {
                name: proposal.client.name,
                companyType: proposal.client.companyType,
            },
            tenant: {
                name: proposal.tenant.name,
                primaryColor: proposal.tenant.primaryColor,
                logo: proposal.tenant.logo,
            },
            services: proposal.services.map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                quantity: s.quantity,
                unitPrice: s.unitPrice,
                displayPrice: s.displayPrice,
                lineTotal: s.lineTotal,
                billingFrequency: s.billingFrequency,
                frequency: s.frequency,
                isOptional: s.isOptional,
            })),
        },
    });
}));
// Get proposal terms by share token (public)
router.get('/view/:token/terms', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { token } = req.params;
    const proposal = await (0, proposalSharingService_js_1.getProposalByShareToken)(token);
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }
    const terms = proposal.terms || (0, ukEngagementLetter_js_1.generateProposalTerms)();
    res.json({
        success: true,
        data: {
            terms,
            practiceName: proposal.tenant.name,
        },
    });
}));
// Submit electronic signature (public)
router.post('/view/:token/sign', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const schema = zod_1.z.object({
        signedBy: zod_1.z.string().min(2),
        signedByRole: zod_1.z.string().min(2),
        signatureData: zod_1.z.string().min(100), // Base64 signature image
        agreementAccepted: zod_1.z.boolean(),
    });
    const { signedBy, signedByRole, signatureData, agreementAccepted } = schema.parse(req.body);
    const { token } = req.params;
    const proposal = await (0, proposalSharingService_js_1.getProposalByShareToken)(token);
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }
    if (proposal.status === 'ACCEPTED') {
        throw new errorHandler_js_1.ApiError('PROPOSAL_ALREADY_ACCEPTED', 'This proposal has already been accepted', 400);
    }
    if (!agreementAccepted) {
        throw new errorHandler_js_1.ApiError('AGREEMENT_REQUIRED', 'You must accept the terms and conditions', 400);
    }
    const result = await (0, proposalSharingService_js_1.recordElectronicSignature)({
        proposalId: proposal.id,
        signedBy,
        signedByRole,
        signatureData,
        ipAddress: req.ip || null,
        agreementVersion: 'PRO-2024-001',
        tenantId: proposal.tenantId,
    });
    if (!result.success) {
        throw new errorHandler_js_1.ApiError('SIGNATURE_FAILED', result.error || 'Failed to record signature', 500);
    }
    // Send acceptance notification to practice
    try {
        const emailService = (0, emailService_js_1.createEmailService)();
        if (emailService) {
            // Get proposal creator details for notification
            const fullProposal = await database_js_1.prisma.proposal.findUnique({
                where: { id: proposal.id },
                include: {
                    createdBy: {
                        select: { email: true, firstName: true, lastName: true },
                    },
                    client: true,
                },
            });
            if (fullProposal?.createdBy?.email) {
                // Generate signed proposal PDF
                const { PDFGenerator } = await Promise.resolve().then(() => __importStar(require('../services/pdfGenerator.js')));
                const proposalPdf = await PDFGenerator.generateProposal(proposal.id);
                // Get signature image
                const signatureImage = await (0, proposalSharingService_js_1.getSignatureImage)(result.signatureId);
                // Send notification email
                await emailService.sendAcceptanceNotification({
                    to: fullProposal.createdBy.email,
                    clientName: fullProposal.client.name,
                    proposalTitle: fullProposal.title,
                    proposalReference: fullProposal.reference,
                    acceptedAt: new Date(),
                    totalAmount: `£${fullProposal.total.toFixed(2)}`,
                    signedBy,
                    signedByRole,
                    proposalPdf,
                    signaturePng: signatureImage
                        ? Buffer.from(signatureImage.split(',')[1], 'base64')
                        : undefined,
                });
                // Update acceptance notified timestamp
                await database_js_1.prisma.proposal.update({
                    where: { id: proposal.id },
                    data: { acceptanceNotifiedAt: new Date() },
                });
                logger_js_1.default.info(`Acceptance notification sent for proposal ${proposal.id}`);
            }
        }
    }
    catch (error) {
        logger_js_1.default.error('Failed to send acceptance notification:', error);
        // Don't fail the request - signature was still recorded
    }
    res.json({
        success: true,
        message: 'Proposal accepted successfully',
        data: {
            acceptedAt: new Date(),
            acceptedBy: signedBy,
        },
    });
}));
// Get signature image (authenticated only)
router.get('/signatures/:id/image', auth_js_1.authenticate, (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { id } = req.params;
    const signatureData = await (0, proposalSharingService_js_1.getSignatureImage)(id);
    if (!signatureData) {
        throw new errorHandler_js_1.ApiError('SIGNATURE_NOT_FOUND', 'Signature not found', 404);
    }
    // Return as base64 or redirect to data URL
    res.json({
        success: true,
        data: {
            imageData: signatureData,
        },
    });
}));
// Download proposal PDF by token (public)
router.get('/view/:token/pdf', (0, errorHandler_js_1.asyncHandler)(async (req, res) => {
    const { token } = req.params;
    const proposal = await (0, proposalSharingService_js_1.getProposalByShareToken)(token);
    if (!proposal) {
        throw new errorHandler_js_1.ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }
    // TODO: Generate and return PDF
    // For now, return a placeholder response
    res.json({
        success: false,
        error: {
            code: 'PDF_GENERATION_PENDING',
            message: 'PDF generation is being implemented',
        },
    });
}));
exports.default = router;
//# sourceMappingURL=proposals-share.js.map