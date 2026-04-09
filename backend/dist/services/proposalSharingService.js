"use strict";
/**
 * Proposal Sharing, Tracking, and e-Signature Service
 * UK compliant proposal viewing and electronic signature handling
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateShareToken = generateShareToken;
exports.createShareableLink = createShareableLink;
exports.revokeShareableLink = revokeShareableLink;
exports.getProposalByShareToken = getProposalByShareToken;
exports.trackProposalView = trackProposalView;
exports.getProposalViewStats = getProposalViewStats;
exports.recordElectronicSignature = recordElectronicSignature;
exports.getProposalSignatures = getProposalSignatures;
exports.getSignatureImage = getSignatureImage;
exports.generateComplianceAuditTrail = generateComplianceAuditTrail;
exports.isShareTokenValid = isShareTokenValid;
exports.generateProposalPdfUrl = generateProposalPdfUrl;
const uuid_1 = require("uuid");
const database_js_1 = require("../config/database.js");
const logger_js_1 = __importDefault(require("../config/logger.js"));
const fileStorage_js_1 = require("./fileStorage.js");
// Generate unique share token
function generateShareToken() {
    return (0, uuid_1.v4)().replace(/-/g, '').substring(0, 32);
}
// Create shareable proposal link
async function createShareableLink(proposalId, expiryDays = 30, tenantSubdomain) {
    try {
        const token = generateShareToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiryDays);
        await database_js_1.prisma.proposal.update({
            where: { id: proposalId },
            data: {
                shareToken: token,
                shareTokenExpiry: expiresAt,
                publicAccessEnabled: true,
            },
        });
        const baseUrl = process.env.PUBLIC_PROPOSAL_URL || `https://${tenantSubdomain}.engage.capstone.co.uk`;
        const shareUrl = `${baseUrl}/proposals/view/${token}`;
        logger_js_1.default.info(`Created shareable link for proposal ${proposalId}`);
        return { token, shareUrl, expiresAt };
    }
    catch (error) {
        logger_js_1.default.error('Failed to create shareable link:', error);
        throw error;
    }
}
// Revoke shareable link
async function revokeShareableLink(proposalId) {
    try {
        await database_js_1.prisma.proposal.update({
            where: { id: proposalId },
            data: {
                shareToken: null,
                shareTokenExpiry: null,
                publicAccessEnabled: false,
            },
        });
        logger_js_1.default.info(`Revoked shareable link for proposal ${proposalId}`);
    }
    catch (error) {
        logger_js_1.default.error('Failed to revoke shareable link:', error);
        throw error;
    }
}
// Get proposal by share token
async function getProposalByShareToken(token) {
    try {
        const proposal = await database_js_1.prisma.proposal.findFirst({
            where: {
                shareToken: token,
                publicAccessEnabled: true,
                shareTokenExpiry: {
                    gt: new Date(),
                },
            },
            include: {
                client: true,
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        primaryColor: true,
                        logo: true,
                        settings: true,
                    },
                },
                services: {
                    include: {
                        serviceTemplate: true,
                    },
                },
            },
        });
        return proposal;
    }
    catch (error) {
        logger_js_1.default.error('Failed to get proposal by share token:', error);
        return null;
    }
}
// Track proposal view
async function trackProposalView(proposalId, ipAddress, userAgent) {
    try {
        await database_js_1.prisma.proposalView.create({
            data: {
                proposalId,
                ipAddress,
                userAgent,
                viewedAt: new Date(),
            },
        });
        // Update proposal viewedAt and status if first view
        const proposal = await database_js_1.prisma.proposal.findUnique({
            where: { id: proposalId },
            select: { status: true, viewedAt: true },
        });
        if (proposal && !proposal.viewedAt) {
            await database_js_1.prisma.proposal.update({
                where: { id: proposalId },
                data: {
                    viewedAt: new Date(),
                    status: 'VIEWED',
                },
            });
        }
        else {
            await database_js_1.prisma.proposal.update({
                where: { id: proposalId },
                data: {
                    viewedAt: new Date(),
                },
            });
        }
        logger_js_1.default.info(`Tracked view for proposal ${proposalId}`);
    }
    catch (error) {
        logger_js_1.default.error('Failed to track proposal view:', error);
    }
}
// Get proposal view statistics
async function getProposalViewStats(proposalId) {
    try {
        const [viewCount, uniqueViews, lastView] = await Promise.all([
            database_js_1.prisma.proposalView.count({
                where: { proposalId },
            }),
            database_js_1.prisma.proposalView.groupBy({
                by: ['ipAddress'],
                where: { proposalId },
            }),
            database_js_1.prisma.proposalView.findFirst({
                where: { proposalId },
                orderBy: { viewedAt: 'desc' },
            }),
        ]);
        return {
            totalViews: viewCount,
            uniqueViews: uniqueViews.length,
            lastViewedAt: lastView?.viewedAt,
            firstViewedAt: await database_js_1.prisma.proposalView
                .findFirst({
                where: { proposalId },
                orderBy: { viewedAt: 'asc' },
            })
                .then((v) => v?.viewedAt),
        };
    }
    catch (error) {
        logger_js_1.default.error('Failed to get proposal view stats:', error);
        return null;
    }
}
// Record electronic signature
async function recordElectronicSignature(data) {
    try {
        // Validate signature data
        if (!data.signatureData || data.signatureData.length < 100) {
            return { success: false, error: 'Invalid signature data' };
        }
        // Save signature as PNG file
        const signatureFilePath = await (0, fileStorage_js_1.saveSignaturePng)(data.tenantId, data.proposalId, data.signatureData);
        // Create signature record with file path
        const signature = await database_js_1.prisma.proposalSignature.create({
            data: {
                proposalId: data.proposalId,
                signedBy: data.signedBy,
                signedByRole: data.signedByRole,
                signatureData: data.signatureData, // Keep base64 for backward compatibility
                signatureFilePath: signatureFilePath,
                signedAt: new Date(),
                ipAddress: data.ipAddress,
                agreementVersion: data.agreementVersion,
                agreementAccepted: true,
            },
        });
        // Update proposal status
        await database_js_1.prisma.proposal.update({
            where: { id: data.proposalId },
            data: {
                status: 'ACCEPTED',
                acceptedAt: new Date(),
                acceptedBy: data.signedBy,
                acceptedByIp: data.ipAddress,
                termsAccepted: true,
                termsAcceptedAt: new Date(),
            },
        });
        logger_js_1.default.info(`Electronic signature recorded for proposal ${data.proposalId}`);
        return { success: true, signatureId: signature.id };
    }
    catch (error) {
        logger_js_1.default.error('Failed to record electronic signature:', error);
        return { success: false, error: error.message };
    }
}
// Get signatures for a proposal
async function getProposalSignatures(proposalId) {
    try {
        const signatures = await database_js_1.prisma.proposalSignature.findMany({
            where: { proposalId },
            orderBy: { signedAt: 'desc' },
            select: {
                id: true,
                signedBy: true,
                signedByRole: true,
                signedAt: true,
                ipAddress: true,
                agreementVersion: true,
                agreementAccepted: true,
                // Exclude signatureData for list view (too large)
            },
        });
        return signatures;
    }
    catch (error) {
        logger_js_1.default.error('Failed to get proposal signatures:', error);
        return [];
    }
}
// Get signature image
async function getSignatureImage(signatureId) {
    try {
        const signature = await database_js_1.prisma.proposalSignature.findUnique({
            where: { id: signatureId },
            select: { signatureData: true, signatureFilePath: true },
        });
        if (!signature)
            return null;
        // Prefer file-based storage if available
        if (signature.signatureFilePath) {
            return (0, fileStorage_js_1.readSignature)(signature.signatureFilePath);
        }
        // Fall back to base64 data
        return signature.signatureData;
    }
    catch (error) {
        logger_js_1.default.error('Failed to get signature image:', error);
        return null;
    }
}
// Generate compliance audit trail for a proposal
async function generateComplianceAuditTrail(proposalId) {
    const auditTrail = [];
    try {
        // Get proposal with related data
        const proposal = await database_js_1.prisma.proposal.findUnique({
            where: { id: proposalId },
            include: {
                views: {
                    orderBy: { viewedAt: 'asc' },
                },
                signatures: {
                    orderBy: { signedAt: 'asc' },
                },
                activityLogs: {
                    where: {
                        action: {
                            in: ['PROPOSAL_CREATED', 'PROPOSAL_SENT', 'PROPOSAL_VIEWED', 'PROPOSAL_ACCEPTED'],
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!proposal)
            return auditTrail;
        // Proposal creation
        auditTrail.push({
            timestamp: proposal.createdAt,
            action: 'PROPOSAL_CREATED',
            actor: proposal.createdById,
            ipAddress: null,
            userAgent: null,
            details: {
                reference: proposal.reference,
                title: proposal.title,
            },
        });
        // Proposal sent
        if (proposal.sentAt) {
            auditTrail.push({
                timestamp: proposal.sentAt,
                action: 'PROPOSAL_SENT',
                actor: proposal.createdById,
                ipAddress: null,
                userAgent: null,
                details: {
                    emailHistory: proposal.emailHistory,
                },
            });
        }
        // Proposal views
        proposal.views.forEach((view) => {
            auditTrail.push({
                timestamp: view.viewedAt,
                action: 'PROPOSAL_VIEWED',
                actor: 'CLIENT',
                ipAddress: view.ipAddress,
                userAgent: view.userAgent,
                details: {
                    viewDuration: view.viewDuration,
                    completed: view.completed,
                },
            });
        });
        // Electronic signatures
        proposal.signatures.forEach((sig) => {
            auditTrail.push({
                timestamp: sig.signedAt,
                action: 'PROPOSAL_ACCEPTED',
                actor: sig.signedBy,
                ipAddress: sig.ipAddress,
                userAgent: null,
                details: {
                    signedByRole: sig.signedByRole,
                    agreementVersion: sig.agreementVersion,
                    agreementAccepted: sig.agreementAccepted,
                    signatureId: sig.id,
                },
            });
        });
        // Sort by timestamp
        return auditTrail.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    catch (error) {
        logger_js_1.default.error('Failed to generate compliance audit trail:', error);
        return auditTrail;
    }
}
// Validate share token
function isShareTokenValid(proposal, token) {
    if (!proposal.publicAccessEnabled) {
        return { valid: false, reason: 'Public access disabled' };
    }
    if (proposal.shareToken !== token) {
        return { valid: false, reason: 'Invalid token' };
    }
    if (!proposal.shareTokenExpiry || new Date() > proposal.shareTokenExpiry) {
        return { valid: false, reason: 'Link expired' };
    }
    return { valid: true };
}
// Generate proposal PDF URL for sharing
function generateProposalPdfUrl(token, tenantSubdomain) {
    const baseUrl = process.env.PUBLIC_PROPOSAL_URL || `https://${tenantSubdomain}.engage.capstone.co.uk`;
    return `${baseUrl}/api/proposals/view/${token}/pdf`;
}
exports.default = {
    generateShareToken,
    createShareableLink,
    revokeShareableLink,
    getProposalByShareToken,
    trackProposalView,
    getProposalViewStats,
    recordElectronicSignature,
    getProposalSignatures,
    getSignatureImage,
    generateComplianceAuditTrail,
    isShareTokenValid,
    generateProposalPdfUrl,
};
//# sourceMappingURL=proposalSharingService.js.map