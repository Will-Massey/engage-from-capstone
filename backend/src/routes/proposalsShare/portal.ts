/**
 * Client portal routes — portal link management (authenticated) and
 * public portal access (portal-token access)
 */

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { authenticate } from '../../middleware/auth.js';
import { extractTenant } from '../../middleware/tenant.js';
import {
  createClientPortalLink,
  revokeClientPortalLink,
  getClientByPortalToken,
  getClientProposalsForPortal,
} from '../../services/proposalSharingService.js';

const router = Router();

// ==================== CLIENT PORTAL ROUTES ====================

// Create client portal link (authenticated)
router.post(
  '/portal/:clientId',
  authenticate,
  extractTenant,
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;
    const schema = z.object({
      expiryDays: z.number().min(1).max(365).optional(),
      frontendOrigin: z.string().url().optional(),
    });
    const { expiryDays, frontendOrigin } = schema.parse(req.body);

    // Verify client exists and belongs to tenant
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: req.tenantId },
    });

    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    const origin =
      frontendOrigin || (typeof req.headers.origin === 'string' ? req.headers.origin : undefined);

    const result = await createClientPortalLink(clientId, expiryDays || 90, origin);

    res.json({
      success: true,
      data: result,
    });
  })
);

// Revoke client portal link (authenticated)
router.delete(
  '/portal/:clientId',
  authenticate,
  extractTenant,
  asyncHandler(async (req, res) => {
    const { clientId } = req.params;

    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId: req.tenantId },
    });

    if (!client) {
      throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    }

    await revokeClientPortalLink(clientId);

    res.json({
      success: true,
      data: { message: 'Portal link revoked' },
    });
  })
);

// Resolve a single proposal's view path (public — portal token scoped).
// Keeps share tokens out of the bulk portal payload; issued on demand per proposal.
router.get(
  '/portal/:token/proposals/:proposalId/view-link',
  asyncHandler(async (req, res) => {
    const { token, proposalId } = req.params;

    const client = await getClientByPortalToken(token);
    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }

    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, clientId: client.id },
      select: { shareToken: true, shareTokenExpiry: true, publicAccessEnabled: true },
    });

    if (
      !proposal ||
      !proposal.shareToken ||
      !proposal.publicAccessEnabled ||
      !proposal.shareTokenExpiry ||
      proposal.shareTokenExpiry <= new Date()
    ) {
      throw new ApiError(
        'PROPOSAL_LINK_UNAVAILABLE',
        'Proposal link not available or expired',
        404
      );
    }

    res.json({
      success: true,
      data: { viewPath: `/proposals/view/${proposal.shareToken}` },
    });
  })
);

// Get client portal data (public — link possession = access)
router.get(
  '/portal/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const client = await getClientByPortalToken(token);

    if (!client) {
      throw new ApiError('PORTAL_NOT_FOUND', 'Portal link not found or expired', 404);
    }

    const proposals = await getClientProposalsForPortal(client.id);

    res.json({
      success: true,
      data: {
        client: {
          id: client.id,
          name: client.name,
          contactName: client.contactName,
          contactEmail: client.contactEmail,
        },
        practice: {
          name: client.tenant.name,
          primaryColor: client.tenant.primaryColor,
          logo: client.tenant.logo,
        },
        proposals: proposals.map((p) => ({
          id: p.id,
          reference: p.reference,
          title: p.title,
          status: p.status,
          total: p.total,
          subtotal: p.subtotal,
          vatAmount: p.vatAmount,
          discountAmount: p.discountAmount,
          validUntil: p.validUntil,
          sentAt: p.sentAt,
          viewedAt: p.viewedAt,
          acceptedAt: p.acceptedAt,
          declinedAt: p.declinedAt,
          createdAt: p.createdAt,
          services: p.services,
          // shareToken is intentionally NOT exposed here — resolve per-proposal
          // via GET /portal/:token/proposals/:proposalId/view-link
          canView: Boolean(
            p.publicAccessEnabled &&
            p.shareToken &&
            p.shareTokenExpiry &&
            p.shareTokenExpiry > new Date()
          ),
        })),
      },
    });
  })
);

export default router;
