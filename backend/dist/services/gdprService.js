"use strict";
/**
 * GDPR Compliance Service
 * Handles data deletion, export, and anonymization for UK GDPR compliance
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.gdprService = exports.GDPRService = void 0;
const crypto_1 = __importDefault(require("crypto"));
class GDPRService {
    /**
     * Anonymize user data instead of hard deletion
     * This maintains referential integrity while protecting privacy
     */
    async deleteUserData(userId, tenantId, prisma) {
        const anonymizedId = `deleted_${crypto_1.default.randomUUID()}`;
        const deletedAt = new Date();
        // Fields that must be retained for legal/accounting purposes
        const retainedFields = [
            'proposal_signatures', // Legal requirement - audit trail
            'transaction_records', // HMRC requirement - 6 years
            'vat_submissions', // Legal requirement
        ];
        await prisma.$transaction([
            // Anonymize user record
            prisma.user.update({
                where: { id: userId },
                data: {
                    email: `${anonymizedId}@deleted.local`,
                    firstName: 'Deleted',
                    lastName: 'User',
                    passwordHash: 'DELETED',
                    phone: null,
                    avatar: null,
                    isActive: false,
                    twoFactorSecret: null,
                    deletedAt,
                    updatedAt: deletedAt,
                },
            }),
            // Delete or anonymize related data
            prisma.refreshToken.deleteMany({
                where: { userId },
            }),
            // Anonymize signatures but keep for legal compliance
            prisma.proposalSignature.updateMany({
                where: {
                    proposal: {
                        createdById: userId,
                    },
                },
                data: {
                    signedBy: 'Deleted User',
                    signatureData: '[REDACTED - Legal Retention]',
                },
            }),
            // Log deletion for compliance
            prisma.activityLog.create({
                data: {
                    action: 'USER_DATA_DELETED',
                    entityType: 'USER',
                    entityId: userId,
                    tenantId,
                    description: `User data anonymized under GDPR Article 17`,
                    metadata: JSON.stringify({
                        anonymizedId,
                        retainedFields,
                        reason: 'GDPR Right to Erasure',
                    }),
                    ipAddress: 'system',
                    createdAt: deletedAt,
                },
            }),
        ]);
        return {
            success: true,
            anonymizedId,
            deletedAt,
            retainedFields,
        };
    }
    /**
     * Export all user data for data portability (GDPR Article 20)
     */
    async exportUserData(userId, prisma) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        subdomain: true,
                    },
                },
                proposals: {
                    include: {
                        services: true,
                        signatures: true,
                        views: true,
                    },
                },
                createdProposals: true,
                activityLogs: {
                    orderBy: { createdAt: 'desc' },
                    take: 1000,
                },
            },
        });
        if (!user) {
            throw new Error('User not found');
        }
        // Remove sensitive fields
        const sanitizedUser = this.sanitizeExport(user);
        return {
            exportDate: new Date(),
            user: sanitizedUser,
            proposals: user.proposals || [],
            clients: await this.getUserClients(userId, prisma),
            activityLogs: user.activityLogs || [],
        };
    }
    /**
     * Get clients associated with user
     */
    async getUserClients(userId, prisma) {
        // Get clients where user created proposals
        const proposals = await prisma.proposal.findMany({
            where: { createdById: userId },
            select: { clientId: true },
            distinct: ['clientId'],
        });
        const clientIds = proposals.map((p) => p.clientId);
        return prisma.client.findMany({
            where: { id: { in: clientIds } },
        });
    }
    /**
     * Sanitize user data for export
     */
    sanitizeExport(user) {
        const { passwordHash, twoFactorSecret, refreshTokens, ...sanitized } = user;
        return sanitized;
    }
    /**
     * Log data processing activity for GDPR compliance
     */
    async logDataActivity(userId, tenantId, action, description, metadata, prisma) {
        await prisma.activityLog.create({
            data: {
                action,
                entityType: 'GDPR',
                entityId: userId,
                tenantId,
                userId,
                description,
                metadata: JSON.stringify(metadata),
                ipAddress: 'system',
                createdAt: new Date(),
            },
        });
    }
    /**
     * Check if user has requested data deletion
     */
    async hasDeletionRequest(userId, prisma) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { deletedAt: true },
        });
        return !!user?.deletedAt;
    }
}
exports.GDPRService = GDPRService;
exports.gdprService = new GDPRService();
exports.default = exports.gdprService;
//# sourceMappingURL=gdprService.js.map