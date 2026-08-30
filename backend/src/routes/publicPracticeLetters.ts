import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { rateLimitingEnabled } from '../utils/securityFlags.js';
import {
  applyLetterSignature,
  getLetterSign,
  hashLetterToken,
  letterIdFromSignToken,
  parseLetterMeta,
} from '../services/practiceLetterTrack.js';

const router = Router();

const publicLetterSignLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  skip: () => !rateLimitingEnabled,
  keyGenerator: (req) => `public-letter-sign:${req.params.token?.slice(0, 40) || 'none'}:${req.ip || 'unknown'}`,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many attempts. Please try again later.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

async function loadLetterBySignToken(token: string) {
  const letterId = letterIdFromSignToken(token);
  if (!letterId) return null;
  const letter = await prisma.practiceLetter.findUnique({
    where: { id: letterId },
    include: {
      client: { select: { name: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!letter) return null;
  const meta = parseLetterMeta(letter.metaJson);
  const sign = getLetterSign(meta);
  if (!sign || sign.tokenHash !== hashLetterToken(token)) return null;
  return { letter, meta, sign };
}

router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const found = await loadLetterBySignToken(req.params.token);
    if (!found) throw new ApiError('NOT_FOUND', 'Letter not found or link expired', 404);
    const { letter, sign } = found;
    res.json({
      success: true,
      data: {
        title: letter.title,
        type: letter.type,
        bodyHtml: letter.bodyHtml,
        clientName: letter.client.name,
        practiceName: letter.tenant.name,
        signed: Boolean(sign.signedAt),
        signedBy: sign.signedBy || null,
        signedAt: sign.signedAt || null,
      },
    });
  })
);

router.post(
  '/:token/sign',
  publicLetterSignLimiter,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        signedBy: z.string().min(2).max(200),
        signerEmail: z.string().email().max(200),
        signatureData: z.string().min(40).max(400_000),
        consentAccepted: z.literal(true),
        deviceInfo: z.string().max(2000).optional(),
      })
      .parse(req.body);

    const found = await loadLetterBySignToken(req.params.token);
    if (!found) throw new ApiError('NOT_FOUND', 'Letter not found or link expired', 404);
    if (found.sign.signedAt) {
      throw new ApiError('ALREADY_SIGNED', 'This letter has already been signed', 400);
    }
    if (!['DISENGAGEMENT', 'PROFESSIONAL_CLEARANCE'].includes(found.letter.type)) {
      throw new ApiError('NOT_SIGNABLE', 'This letter type is not signed here', 400);
    }

    const consentText = `I have read this letter and I am authorised to sign on behalf of ${found.letter.client.name}.`;
    const meta = applyLetterSignature(found.meta, {
      signedBy: body.signedBy.trim(),
      signerEmail: body.signerEmail.trim(),
      signatureData: body.signatureData,
      consentText,
      deviceInfo: body.deviceInfo,
    });

    const letter = await prisma.practiceLetter.update({
      where: { id: found.letter.id },
      data: {
        metaJson: JSON.stringify(meta),
        status: 'SENT',
        sentAt: found.letter.sentAt || new Date(),
      },
    });

    res.json({
      success: true,
      data: { signed: true, signedBy: body.signedBy.trim(), signedAt: letter.sentAt },
    });
  })
);

export default router;
