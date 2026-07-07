/**
 * Signature image retrieval (tenant-scoped) and public proposal PDF download
 */

import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { authenticate } from '../../middleware/auth.js';
import { getProposalByShareToken } from '../../services/proposalSharingService.js';
import PDFGenerator from '../../services/pdfGenerator.js';

const router = Router();

// Get signature image (authenticated only, tenant-scoped)
router.get(
  '/signatures/:id/image',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const signature = await prisma.proposalSignature.findFirst({
      where: {
        id,
        proposal: { tenantId },
      },
      select: { signatureData: true, signatureFilePath: true },
    });

    if (!signature) {
      throw new ApiError('SIGNATURE_NOT_FOUND', 'Signature not found', 404);
    }

    let imageData: string | null = signature.signatureData;
    if (signature.signatureFilePath) {
      const { readSignature } = await import('../../services/fileStorage.js');
      imageData = await readSignature(signature.signatureFilePath);
    }

    res.json({
      success: true,
      data: { imageData },
    });
  })
);

// Download proposal PDF by token (public)
router.get(
  '/view/:token/pdf',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    const proposal = await getProposalByShareToken(token);

    if (!proposal) {
      throw new ApiError('PROPOSAL_NOT_FOUND', 'Proposal not found or link expired', 404);
    }

    // Generate and return PDF
    const pdfBuffer = await PDFGenerator.generateProposal(proposal.id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proposal-${proposal.reference}.pdf"`
    );
    res.send(pdfBuffer);
  })
);

export default router;
