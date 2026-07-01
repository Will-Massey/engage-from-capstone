/**
 * GDPR Compliance Service
 * Handles data deletion, export, and anonymization for UK GDPR compliance
 */

import crypto from 'crypto';

export interface UserDataExport {
  exportDate: Date;
  user: Record<string, unknown>;
  proposals: unknown[];
  clients: unknown[];
  activityLogs: unknown[];
}

export interface DataDeletionResult {
  success: boolean;
  anonymizedId: string;
  deletedAt: Date;
  retainedFields: string[];
}

export class GDPRService {
  /**
   * Anonymize user data instead of hard deletion
   * This maintains referential integrity while protecting privacy
   */
  async deleteUserData(userId: string, tenantId: string, prisma: any): Promise<DataDeletionResult> {
    const anonymizedId = `deleted_${crypto.randomUUID()}`;
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
          twoFactorEnabled: false,
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
  async exportUserData(userId: string, prisma: any): Promise<UserDataExport> {
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
  private async getUserClients(userId: string, prisma: any): Promise<unknown[]> {
    // Get clients where user created proposals
    const proposals = await prisma.proposal.findMany({
      where: { createdById: userId },
      select: { clientId: true },
      distinct: ['clientId'],
    });

    const clientIds = proposals.map((p: any) => p.clientId);

    return prisma.client.findMany({
      where: { id: { in: clientIds } },
    });
  }

  /**
   * Sanitize user data for export
   */
  private sanitizeExport(user: any): Record<string, unknown> {
    const { passwordHash, twoFactorSecret, refreshTokens, ...sanitized } = user;
    return sanitized;
  }

  /**
   * Log data processing activity for GDPR compliance
   */
  async logDataActivity(
    userId: string,
    tenantId: string,
    action: string,
    description: string,
    metadata: Record<string, unknown>,
    prisma: any
  ): Promise<void> {
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
  async hasDeletionRequest(userId: string, prisma: any): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true },
    });
    return !!user?.deletedAt;
  }
}

export const gdprService = new GDPRService();
export default gdprService;
