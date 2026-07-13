/**
 * GDPR Compliance Service
 * Handles data deletion, export, and anonymization for UK GDPR compliance
 */

import crypto from 'crypto';
import { deleteAmlDocument, deleteSignature } from './fileStorage.js';

export interface TruncationInfo {
  returned: number;
  total: number;
  truncated: boolean;
}

export interface UserDataExport {
  exportDate: Date;
  user: Record<string, unknown>;
  proposals: unknown[];
  clients: unknown[];
  activityLogs: unknown[];
  truncated: boolean;
  truncation: Record<string, TruncationInfo>;
}

export interface AuditExport {
  exportDate: Date;
  exportType: 'soc2_audit';
  tenant: Record<string, unknown>;
  users: unknown[];
  signatures: unknown[];
  activityLogs: unknown[];
  emailLogs: unknown[];
  accessEvents: unknown[];
}

export interface DataDeletionResult {
  success: boolean;
  anonymizedId: string;
  deletedAt: Date;
  retainedFields: string[];
}

// Row caps applied to unbounded log tables in exports. Paired with a count()
// so truncation is reported in the export metadata rather than silently lost.
const ACTIVITY_LOG_EXPORT_LIMIT = 1000;
const TENANT_LOG_EXPORT_LIMIT = 10000;

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
        createdProposals: {
          include: {
            services: true,
            signatures: true,
            views: true,
          },
        },
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          take: ACTIVITY_LOG_EXPORT_LIMIT,
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Remove sensitive fields
    const sanitizedUser = this.sanitizeExport(user);

    const activityLogs = user.activityLogs || [];
    // Detect (rather than silently swallow) truncation of the capped activity log.
    const activityLogTotal = await prisma.activityLog.count({ where: { userId } });
    const truncation: Record<string, TruncationInfo> = {
      activityLogs: {
        returned: activityLogs.length,
        total: activityLogTotal,
        truncated: activityLogTotal > activityLogs.length,
      },
    };

    return {
      exportDate: new Date(),
      user: sanitizedUser,
      proposals: user.createdProposals || [],
      clients: await this.getUserClients(userId, prisma),
      activityLogs,
      truncated: Object.values(truncation).some((t) => t.truncated),
      truncation,
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
   * SOC2-style audit export for tenant compliance reviews.
   */
  async exportTenantAudit(tenantId: string, prisma: any): Promise<AuditExport> {
    const [tenant, users, signatures, activityLogs, emailLogs] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          subdomain: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.user.findMany({
        where: { tenantId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      prisma.proposalSignature.findMany({
        where: { proposal: { tenantId } },
        select: {
          id: true,
          signedBy: true,
          signerEmail: true,
          signatureType: true,
          documentHash: true,
          termsHash: true,
          ipAddress: true,
          signedAt: true,
          proposalId: true,
        },
        orderBy: { signedAt: 'desc' },
        take: 5000,
      }),
      prisma.activityLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
      prisma.emailLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 2000,
      }),
    ]);

    const accessEvents = activityLogs.filter((l: { action: string }) =>
      [
        'USER_LOGIN',
        'USER_LOGOUT',
        'PROPOSAL_SENT',
        'PROPOSAL_ACCEPTED',
        'EMAIL_WEBHOOK_EVENT',
      ].includes(l.action)
    );

    return {
      exportDate: new Date(),
      exportType: 'soc2_audit',
      tenant: tenant || {},
      users,
      signatures,
      activityLogs,
      emailLogs,
      accessEvents,
    };
  }

  /**
   * Full tenant data export for portability when a practice offboards
   * (GDPR Article 20). Broader than exportTenantAudit — includes the working
   * data (clients, proposals, templates), not just the audit trail.
   */
  async exportTenantData(tenantId: string, prisma: any): Promise<Record<string, unknown>> {
    const [
      tenant,
      users,
      clients,
      proposals,
      serviceTemplates,
      proposalTemplates,
      coverLetterTemplates,
      activityLogs,
      emailLogs,
      paymentSplits,
      touchpoints,
      regulatorySignals,
      activityLogTotal,
      emailLogTotal,
    ] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.user.findMany({ where: { tenantId } }),
      prisma.client.findMany({ where: { tenantId } }),
      prisma.proposal.findMany({
        where: { tenantId },
        include: { services: true, signatures: true, views: true },
      }),
      prisma.serviceTemplate.findMany({ where: { tenantId } }),
      prisma.proposalTemplate.findMany({ where: { tenantId } }),
      prisma.coverLetterTemplate.findMany({ where: { tenantId } }),
      prisma.activityLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: TENANT_LOG_EXPORT_LIMIT,
      }),
      prisma.emailLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: TENANT_LOG_EXPORT_LIMIT,
      }),
      prisma.paymentSplit.findMany({ where: { tenantId } }),
      prisma.touchpoint.findMany({ where: { tenantId } }),
      prisma.regulatorySignal.findMany({ where: { tenantId } }),
      prisma.activityLog.count({ where: { tenantId } }),
      prisma.emailLog.count({ where: { tenantId } }),
    ]);

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Report truncation of the capped log tables rather than losing rows silently.
    const truncation: Record<string, TruncationInfo> = {
      activityLogs: {
        returned: activityLogs.length,
        total: activityLogTotal,
        truncated: activityLogTotal > activityLogs.length,
      },
      emailLogs: {
        returned: emailLogs.length,
        total: emailLogTotal,
        truncated: emailLogTotal > emailLogs.length,
      },
    };

    return {
      exportDate: new Date(),
      exportType: 'tenant_full',
      tenant,
      users: users.map((u: any) => this.sanitizeExport(u)),
      clients,
      proposals,
      serviceTemplates,
      proposalTemplates,
      coverLetterTemplates,
      activityLogs,
      emailLogs,
      paymentSplits,
      touchpoints,
      regulatorySignals,
      truncated: Object.values(truncation).some((t) => t.truncated),
      truncation,
    };
  }

  /**
   * Close a practice account: deactivate the tenant and anonymize personal
   * data across its users and clients, while RETAINING proposal signatures and
   * financial records for the legal retention window (HMRC ~6 years). Mirrors
   * the per-user erasure philosophy at tenant scope. Reversible only via
   * restore-from-backup; a later hard purge can run after the retention window.
   */
  async closeTenantAccount(
    tenantId: string,
    prisma: any,
    context: { actorUserId?: string; reason?: string } = {}
  ): Promise<{
    success: boolean;
    closedAt: Date;
    usersAnonymized: number;
    clientsAnonymized: number;
    retainedFields: string[];
  }> {
    const closedAt = new Date();
    const retainedFields = [
      'proposal_signatures', // legal audit trail
      'proposal_financials', // HMRC 6-year retention (totals, payment splits)
      'vat_submissions',
    ];

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, settings: true, isActive: true },
    });
    if (!tenant) throw new Error('Tenant not found');

    const settings = (() => {
      try {
        return JSON.parse(tenant.settings || '{}');
      } catch {
        return {};
      }
    })();
    if (settings.closedAt) {
      throw new Error('Account is already closed');
    }

    const [users, clients, signatures] = await Promise.all([
      prisma.user.findMany({ where: { tenantId }, select: { id: true } }),
      prisma.client.findMany({
        where: { tenantId },
        select: { id: true, amlSubmissionData: true },
      }),
      prisma.proposalSignature.findMany({
        where: { proposal: { tenantId }, signatureFilePath: { not: null } },
        select: { signatureFilePath: true },
      }),
    ]);

    // Enumerate stored files (AML documents + signature images) BEFORE the
    // transaction nulls the DB references, so offboarding removes files too.
    const amlFileKeys = clients.flatMap((c: any) => this.extractAmlFileKeys(c.amlSubmissionData));
    const signatureFileKeys = signatures
      .map((s: any) => s.signatureFilePath)
      .filter((p: unknown): p is string => typeof p === 'string' && p.length > 0);

    const ops: unknown[] = [];

    // Anonymize each user (unique anonymized email per row: email is unique per tenant).
    for (const u of users) {
      const anon = `deleted_${crypto.randomUUID()}`;
      ops.push(
        prisma.user.update({
          where: { id: u.id },
          data: {
            email: `${anon}@deleted.local`,
            firstName: 'Deleted',
            lastName: 'User',
            phone: null,
            jobTitle: null,
            avatar: null,
            passwordHash: 'DELETED',
            twoFactorSecret: null,
            twoFactorEnabled: false,
            isActive: false,
            deletedAt: closedAt,
          },
        })
      );
    }

    // Anonymize client PII (retain the record so financial/signature links hold).
    for (const c of clients) {
      const anon = `deleted_${crypto.randomUUID()}`;
      ops.push(
        prisma.client.update({
          where: { id: c.id },
          data: {
            name: 'Closed Practice Client',
            contactEmail: `${anon}@deleted.local`,
            contactPhone: null,
            contactName: null,
            notes: null,
            amlSubmissionData: null,
            portalToken: null,
            portalTokenExpiry: null,
          },
        })
      );
    }

    // Redact signature images/PII but retain the row + hashes for the legal
    // audit trail; the underlying image files are deleted after the transaction.
    ops.push(
      prisma.proposalSignature.updateMany({
        where: { proposal: { tenantId } },
        data: {
          signedBy: 'Deleted User',
          signerEmail: null,
          signatureData: '[REDACTED - Legal Retention]',
          signatureFilePath: null,
        },
      })
    );

    // Revoke any live public/share access to proposals (client portal tokens
    // are revoked on the client update above).
    ops.push(
      prisma.proposal.updateMany({
        where: { tenantId },
        data: { publicAccessEnabled: false, shareToken: null },
      })
    );

    // Invalidate all sessions for the tenant's users.
    ops.push(prisma.refreshToken.deleteMany({ where: { user: { tenantId } } }));

    // Mark the tenant closed and stop billing enforcement.
    ops.push(
      prisma.tenant.update({
        where: { id: tenantId },
        data: {
          isActive: false,
          subscriptionStatus: 'cancelled',
          settings: JSON.stringify({
            ...settings,
            closedAt: closedAt.toISOString(),
            closedReason: context.reason || 'account_closed',
          }),
        },
      })
    );

    ops.push(
      prisma.activityLog.create({
        data: {
          tenantId,
          userId: context.actorUserId,
          action: 'TENANT_ACCOUNT_CLOSED',
          entityType: 'TENANT',
          entityId: tenantId,
          description: 'Practice account closed; personal data anonymized under GDPR Article 17',
          metadata: JSON.stringify({
            usersAnonymized: users.length,
            clientsAnonymized: clients.length,
            retainedFields,
          }),
          ipAddress: 'system',
          createdAt: closedAt,
        },
      })
    );

    await prisma.$transaction(ops);

    // Remove stored files after the DB PII/references are cleared. Helpers are
    // best-effort and swallow missing-file errors.
    await Promise.all([
      ...amlFileKeys.map((key) => deleteAmlDocument(key)),
      ...signatureFileKeys.map((key) => deleteSignature(key)),
    ]);

    return {
      success: true,
      closedAt,
      usersAnonymized: users.length,
      clientsAnonymized: clients.length,
      retainedFields,
    };
  }

  /**
   * Extract the stored file keys (relativePath) for a client's AML documents
   * from the JSON blob persisted in Client.amlSubmissionData. Returns [] when
   * the blob is absent or unparseable. See routes/onboarding.ts for the shape:
   * { photoIdDocument: { relativePath, ... }, proofOfAddressDocument: {...} }.
   */
  private extractAmlFileKeys(amlSubmissionData: string | null | undefined): string[] {
    if (!amlSubmissionData) return [];
    let parsed: any;
    try {
      parsed = JSON.parse(amlSubmissionData);
    } catch {
      return [];
    }
    const keys: string[] = [];
    for (const doc of [parsed?.photoIdDocument, parsed?.proofOfAddressDocument]) {
      const key = doc?.relativePath;
      if (typeof key === 'string' && key.length > 0) keys.push(key);
    }
    return keys;
  }

  /**
   * Client-scoped erasure (GDPR Article 17) for a single data subject.
   * Anonymizes Client PII, redacts recipient PII on the client's email logs,
   * redacts signature image/PII (retaining the row + hashes for the legal audit
   * trail), and deletes the client's stored AML documents + signature image
   * files. Financial/signature-anchoring rows are retained, not hard-deleted.
   */
  async eraseClientData(
    tenantId: string,
    clientId: string,
    prisma: any,
    context: { actorUserId?: string; reason?: string } = {}
  ): Promise<{
    success: boolean;
    erasedAt: Date;
    amlFilesDeleted: number;
    signatureFilesDeleted: number;
    retainedFields: string[];
  }> {
    const erasedAt = new Date();
    const retainedFields = [
      'proposal_signatures', // legal audit trail (row + hashes retained; PII redacted)
      'proposal_financials', // HMRC 6-year retention
    ];

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true, amlSubmissionData: true },
    });
    if (!client) throw new Error('Client not found');

    // Enumerate stored files BEFORE nulling the DB references that point to them.
    const amlFileKeys = this.extractAmlFileKeys(client.amlSubmissionData);
    const signatures = await prisma.proposalSignature.findMany({
      where: { proposal: { clientId, tenantId }, signatureFilePath: { not: null } },
      select: { signatureFilePath: true },
    });
    const signatureFileKeys = signatures
      .map((s: any) => s.signatureFilePath)
      .filter((p: unknown): p is string => typeof p === 'string' && p.length > 0);

    const anon = `deleted_${crypto.randomUUID()}`;

    await prisma.$transaction([
      // Anonymize client PII; retain the row so financial/signature links hold.
      prisma.client.update({
        where: { id: clientId },
        data: {
          name: 'Erased Client',
          contactEmail: `${anon}@deleted.local`,
          contactName: null,
          contactPhone: null,
          notes: null,
          amlSubmissionData: null,
          portalToken: null,
          portalTokenExpiry: null,
        },
      }),

      // Redact recipient PII on the client's email logs; keep the audit rows.
      prisma.emailLog.updateMany({
        where: { clientId, tenantId },
        data: { to: '[REDACTED]' },
      }),

      // Redact signature image/PII but keep the row + hashes for legal audit.
      prisma.proposalSignature.updateMany({
        where: { proposal: { clientId, tenantId } },
        data: {
          signedBy: 'Erased Client',
          signerEmail: null,
          signatureData: '[REDACTED - Legal Retention]',
          signatureFilePath: null,
        },
      }),

      prisma.activityLog.create({
        data: {
          tenantId,
          userId: context.actorUserId,
          action: 'CLIENT_DATA_ERASED',
          entityType: 'CLIENT',
          entityId: clientId,
          description: 'Client personal data erased under GDPR Article 17',
          metadata: JSON.stringify({
            reason: context.reason || 'GDPR Right to Erasure',
            amlFilesDeleted: amlFileKeys.length,
            signatureFilesDeleted: signatureFileKeys.length,
            retainedFields,
          }),
          ipAddress: 'system',
          createdAt: erasedAt,
        },
      }),
    ]);

    // Delete stored files after DB references are cleared (best-effort).
    await Promise.all([
      ...amlFileKeys.map((key) => deleteAmlDocument(key)),
      ...signatureFileKeys.map((key) => deleteSignature(key)),
    ]);

    return {
      success: true,
      erasedAt,
      amlFilesDeleted: amlFileKeys.length,
      signatureFilesDeleted: signatureFileKeys.length,
      retainedFields,
    };
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
