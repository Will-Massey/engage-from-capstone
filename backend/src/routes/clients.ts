import { Router } from 'express';
import { z } from 'zod';
import {
  CompanyType,
  MTDITSAStatus,
  ClientLifecycleStage,
  ClientRelationship,
} from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { enforceTierLimit } from '../middleware/tierLimits.js';
import { MTDITSAService } from '../services/mtditsa.js';
import logger from '../config/logger.js';
// Validation helper functions
const validateUKPostcode = (postcode: string): boolean => {
  const postcodeRegex = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i;
  return postcodeRegex.test(postcode);
};

const validateUTR = (utr: string): boolean => {
  const utrRegex = /^\d{10}$/;
  return utrRegex.test(utr);
};

const validateCompanyNumber = (number: string): boolean => {
  const companyNumberRegex = /^[A-Za-z0-9]{6,8}$/;
  return companyNumberRegex.test(number);
};

const router = Router();

// Validation schemas - relaxed validation, only required fields
const addressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  country: z.string().default('United Kingdom'),
});

const createClientSchema = z.object({
  name: z.string().min(1, 'Client name is required'),
  companyType: z.nativeEnum(CompanyType),
  contactEmail: z.string().min(1, 'Email is required'),
  contactPhone: z.string().optional(),
  contactName: z.string().optional(),
  companyNumber: z.string().optional(),
  utr: z.string().optional(),
  vatNumber: z.string().optional(),
  vatRegistered: z.boolean().default(false),
  address: addressSchema.optional(),
  industry: z.string().optional(),
  employeeCount: z.number().int().min(0).optional(),
  turnover: z.number().min(0).optional(),
  yearEnd: z.string().optional(),
  mtditsaIncome: z.number().min(0).optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  clientRelationship: z.nativeEnum(ClientRelationship).default(ClientRelationship.NEW),
});

const updateClientSchema = createClientSchema.partial().extend({
  contactName: z.string().nullish(),
  contactPhone: z.string().nullish(),
  companyNumber: z.string().nullish(),
  utr: z.string().nullish(),
  vatNumber: z.string().nullish(),
  industry: z.string().nullish(),
  yearEnd: z.string().nullish(),
  notes: z.string().nullish(),
  clientRelationship: z.nativeEnum(ClientRelationship).optional(),
  lifecycleStage: z.nativeEnum(ClientLifecycleStage).optional(),
  touchpointsPaused: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
  nextVatDueDate: z.string().datetime().optional().or(z.null()),
  nextAccountsDueDate: z.string().datetime().optional().or(z.null()),
});

/** Prisma stores address as a JSON string — normalise object or string input on write */
function serialiseAddressForDb(address: unknown): string | null | undefined {
  if (address === undefined) return undefined;
  if (address === null) return null;
  if (typeof address === 'string') {
    const trimmed = address.trim();
    if (!trimmed) return null;
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      return JSON.stringify({ line1: trimmed, country: 'United Kingdom' });
    }
  }
  if (typeof address === 'object') {
    const obj = address as Record<string, unknown>;
    const hasContent = Object.values(obj).some((v) => v != null && String(v).trim() !== '');
    return hasContent ? JSON.stringify(address) : null;
  }
  return undefined;
}

/** Parse stored JSON address for API responses */
function formatClientForResponse<T extends { address?: string | null }>(client: T) {
  if (!client?.address || typeof client.address !== 'string') return client;
  try {
    return { ...client, address: JSON.parse(client.address) };
  } catch {
    return client;
  }
}

const incomeSourceSchema = z.object({
  type: z.enum(['SELF_EMPLOYMENT', 'PROPERTY', 'PARTNERSHIP', 'OTHER']),
  amount: z.number().min(0),
});

/**
 * POST /api/clients/import
 * Bulk import clients (Engager switcher CSV path). Skips duplicate emails.
 * Max 200 rows per request.
 */
router.post(
  '/import',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        rows: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              contactEmail: z.string().email().max(200),
              contactName: z.string().max(120).optional().nullable(),
              contactPhone: z.string().max(40).optional().nullable(),
              companyNumber: z.string().max(20).optional().nullable(),
              companyType: z.string().max(40).optional().nullable(),
              notes: z.string().max(2000).optional().nullable(),
            })
          )
          .min(1)
          .max(200),
        /** If true, treat existing emails as update of name/phone only */
        updateExisting: z.boolean().optional().default(false),
      })
      .parse(req.body);

    const tenantId = req.tenantId!;
    const created: string[] = [];
    const updated: string[] = [];
    const skipped: Array<{ email: string; reason: string }> = [];

    const mapType = (raw?: string | null): CompanyType => {
      const t = (raw || '').toUpperCase().replace(/\s+/g, '_');
      if (t.includes('SOLE') || t === 'ST') return CompanyType.SOLE_TRADER;
      if (t.includes('PARTNER') && !t.includes('LLP')) return CompanyType.PARTNERSHIP;
      if (t === 'LLP') return CompanyType.LLP;
      if (t.includes('CHARITY')) return CompanyType.CHARITY;
      if (t.includes('NON') || t.includes('NPO')) return CompanyType.NON_PROFIT;
      if (t.includes('LIMITED') || t === 'LTD' || t === 'LIMITED_COMPANY')
        return CompanyType.LIMITED_COMPANY;
      return CompanyType.LIMITED_COMPANY;
    };

    for (const row of body.rows) {
      const email = row.contactEmail.trim().toLowerCase();
      const existing = await prisma.client.findFirst({
        where: { tenantId, contactEmail: { equals: email, mode: 'insensitive' } },
      });

      if (existing) {
        if (body.updateExisting) {
          await prisma.client.update({
            where: { id: existing.id },
            data: {
              name: row.name.trim(),
              contactName: row.contactName?.trim() || existing.contactName,
              contactPhone: row.contactPhone?.trim() || existing.contactPhone,
              companyNumber: row.companyNumber?.trim() || existing.companyNumber,
              notes: row.notes
                ? [existing.notes, row.notes].filter(Boolean).join('\n')
                : existing.notes,
            },
          });
          updated.push(existing.id);
        } else {
          skipped.push({ email, reason: 'duplicate_email' });
        }
        continue;
      }

      try {
        const client = await prisma.client.create({
          data: {
            name: row.name.trim(),
            contactEmail: email,
            contactName: row.contactName?.trim() || null,
            contactPhone: row.contactPhone?.trim() || null,
            companyNumber: row.companyNumber?.trim() || null,
            companyType: mapType(row.companyType),
            notes: row.notes?.trim() || null,
            clientRelationship: ClientRelationship.EXISTING,
            tenantId,
            tags: 'imported,switcher',
          } as any,
        });
        created.push(client.id);
      } catch (e: any) {
        skipped.push({ email, reason: e?.message || 'create_failed' });
      }
    }

    await prisma.activityLog.create({
      data: {
        tenantId,
        userId: req.user!.id,
        action: 'CLIENTS_IMPORTED',
        entityType: 'CLIENT',
        description: `Imported clients: ${created.length} created, ${updated.length} updated, ${skipped.length} skipped`,
        metadata: JSON.stringify({
          created: created.length,
          updated: updated.length,
          skipped: skipped.length,
        }),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        created: created.length,
        updated: updated.length,
        skipped: skipped.length,
        skippedRows: skipped.slice(0, 50),
        createdIds: created.slice(0, 50),
      },
      message: `Import complete: ${created.length} new, ${updated.length} updated, ${skipped.length} skipped`,
    });
  })
);

/**
 * GET /api/clients
 * List clients for tenant
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const {
      search,
      companyType,
      mtditsaStatus,
      lifecycleStage,
      page = '1',
      limit = '20',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    logger.info(`Fetching clients for tenant: ${req.tenantId}, user: ${req.user?.id}`);

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const where: any = {
      tenantId: req.tenantId,
      isActive: true,
    };

    if (companyType) {
      where.companyType = companyType;
    }

    if (mtditsaStatus) {
      where.mtditsaStatus = mtditsaStatus;
    }

    if (lifecycleStage) {
      where.lifecycleStage = lifecycleStage;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { contactEmail: { contains: search as string, mode: 'insensitive' } },
        { companyNumber: { contains: search as string, mode: 'insensitive' } },
        { utr: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    // Get clients with count
    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          _count: {
            select: { proposals: true, jobs: true },
          },
        },
        skip,
        take,
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.client.count({ where }),
    ]);

    res.json({
      success: true,
      data: clients,
      meta: {
        page: parseInt(page as string),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  })
);

/**
 * GET /api/clients/:id
 * Get single client
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
      include: {
        proposals: {
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            totalPence: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    res.json({
      success: true,
      data: formatClientForResponse(client),
    });
  })
);

/**
 * POST /api/clients/:id/aml-complete
 * Mark AML as complete and trigger next touchpoints
 */
router.post(
  '/:id/aml-complete',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const client = await prisma.client.findFirst({ where: { id, tenantId } });
    if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

    const { triggerAmlComplete } = await import('../jobs/touchpointEngine.js');
    await triggerAmlComplete(id, tenantId);

    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'CLIENT_AML_COMPLETE',
        entityType: 'CLIENT',
        entityId: id,
        description: 'AML verification marked complete',
      },
    });

    res.json({ success: true });
  })
);

/**
 * POST /api/clients/:id/engagement-letter-signed
 * Mark engagement letter as signed and start info request sequence
 */
router.post(
  '/:id/engagement-letter-signed',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const client = await prisma.client.findFirst({ where: { id, tenantId } });
    if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

    const { triggerEngagementLetterSigned } = await import('../jobs/touchpointEngine.js');
    await triggerEngagementLetterSigned(id, tenantId);

    res.json({ success: true });
  })
);

/**
 * POST /api/clients/:id/info-received
 * Mark requested info as received and schedule onboarding + kickoff
 */
router.post(
  '/:id/info-received',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const client = await prisma.client.findFirst({ where: { id, tenantId } });
    if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

    const { triggerInfoReceived } = await import('../jobs/touchpointEngine.js');
    await triggerInfoReceived(id, tenantId);

    res.json({ success: true });
  })
);

/**
 * POST /api/clients/:id/schedule-deadline-reminders
 */
router.post(
  '/:id/schedule-deadline-reminders',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    const { scheduleDeadlineReminders } = await import('../jobs/touchpointEngine.js');
    await scheduleDeadlineReminders(id, tenantId);

    res.json({ success: true });
  })
);

/**
 * GET /api/clients/:id/companies-house
 * Read-only Companies House snapshot for a client
 */
router.get(
  '/:id/companies-house',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const companyNumber =
      typeof req.query.companyNumber === 'string' ? req.query.companyNumber : undefined;
    const { getClientCompaniesHouseSnapshot } =
      await import('../services/companiesHouseEnrichment.js');
    const { createCompaniesHouseService } = await import('../services/companiesHouse.js');
    const data = await getClientCompaniesHouseSnapshot(req.tenantId!, id, companyNumber);
    res.json({
      success: true,
      data: data ?? null,
      configured: !!createCompaniesHouseService(),
    });
  })
);

/**
 * POST /api/clients/:id/enrich-companies-house
 * Pull Companies House data into the client record and return snapshot for Clara
 */
router.post(
  '/:id/enrich-companies-house',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = z
      .object({
        companyNumber: z.string().optional(),
        searchByName: z.boolean().optional().default(true),
        fillMissingOnly: z.boolean().optional().default(true),
      })
      .parse(req.body ?? {});

    const { enrichClientFromCompaniesHouse } =
      await import('../services/companiesHouseEnrichment.js');
    const result = await enrichClientFromCompaniesHouse(req.tenantId!, id, body);

    if (result.enriched) {
      await prisma.activityLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          action: 'CLIENT_CH_ENRICHED',
          entityType: 'CLIENT',
          entityId: id,
          description: `Companies House data pulled for client (${result.matchedBy})`,
        },
      });
    }

    res.json({ success: true, data: result });
  })
);

/**
 * GET /api/clients/:id/activity
 * Timeline of activity for this client (used for touchpoint history)
 */
router.get(
  '/:id/activity',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tenantId = req.tenantId!;

    // Client entity logs
    const clientLogs = await prisma.activityLog.findMany({
      where: {
        tenantId,
        entityType: 'CLIENT',
        entityId: id,
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    // Touchpoint logs for this client's touchpoints
    const clientTouchpoints = await prisma.touchpoint.findMany({
      where: { clientId: id, tenantId },
      select: { id: true },
    });
    const tpIds = clientTouchpoints.map((t) => t.id);

    let touchpointLogs: any[] = [];
    if (tpIds.length > 0) {
      touchpointLogs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          entityType: 'TOUCHPOINT',
          entityId: { in: tpIds },
        },
        orderBy: { createdAt: 'desc' },
        take: 60,
        include: { user: { select: { firstName: true, lastName: true } } },
      });
    }

    // Merge and sort
    const all = [...clientLogs, ...touchpointLogs].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({ success: true, data: all });
  })
);

/**
 * POST /api/clients
 * Create new client
 */
router.post(
  '/',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  enforceTierLimit('clients'),
  asyncHandler(async (req, res) => {
    const data = createClientSchema.parse(req.body);

    logger.info(
      `Creating client for tenant: ${req.tenantId}, user: ${req.user?.id}, email: ${data.contactEmail}`
    );

    // Check for duplicate email
    const existingClient = await prisma.client.findFirst({
      where: {
        tenantId: req.tenantId,
        contactEmail: data.contactEmail,
      },
    });

    if (existingClient) {
      logger.warn(`Duplicate client email: ${data.contactEmail} for tenant: ${req.tenantId}`);
      throw new ApiError('DUPLICATE_EMAIL', 'A client with this email already exists', 409);
    }

    // Calculate MTD ITSA status if income provided AND client is a sole trader or partnership
    // MTD ITSA only applies to self-employed individuals (sole traders) and some partnerships
    // Limited companies, LLPs, charities, and non-profits are NOT subject to MTD ITSA
    let mtditsaStatus: MTDITSAStatus = MTDITSAStatus.NOT_REQUIRED;
    let mtditsaEligible = false;

    const isMtditsaApplicable =
      data.companyType === CompanyType.SOLE_TRADER || data.companyType === CompanyType.PARTNERSHIP;

    if (data.mtditsaIncome && isMtditsaApplicable) {
      const assessment = MTDITSAService.calculateStatus(data.mtditsaIncome, [], {
        isCharity: data.companyType === CompanyType.CHARITY,
      });
      mtditsaStatus = assessment.status;
      mtditsaEligible = assessment.isRequired;
    }

    // Create client - omit tags and address from spread since we handle them separately
    const { tags, address, ...clientData } = data;
    const client = await prisma.client.create({
      data: {
        ...clientData,
        tenantId: req.tenantId,
        mtditsaStatus,
        mtditsaEligible,
        address: address ? JSON.stringify(address) : undefined,
        tags: tags ? tags.join(',') : '',
      } as any,
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'CLIENT_CREATED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `Created client "${client.name}"`,
      },
    });

    res.status(201).json({
      success: true,
      data: formatClientForResponse(client),
    });
  })
);

/**
 * PUT /api/clients/:id
 * Update client
 */
router.put(
  '/:id',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER', 'SENIOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const data = updateClientSchema.parse(req.body);

    // Check client exists
    const existingClient = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!existingClient) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    // Check email uniqueness if changing
    if (data.contactEmail && data.contactEmail !== existingClient.contactEmail) {
      const duplicateEmail = await prisma.client.findFirst({
        where: {
          tenantId: req.tenantId,
          contactEmail: data.contactEmail,
          id: { not: id },
        },
      });

      if (duplicateEmail) {
        throw new ApiError('DUPLICATE_EMAIL', 'A client with this email already exists', 409);
      }
    }

    // Recalculate MTD ITSA status if income changed AND client is applicable type
    // MTD ITSA only applies to sole traders and partnerships
    let mtditsaData: { mtditsaStatus?: MTDITSAStatus; mtditsaEligible?: boolean } = {};
    const companyType = data.companyType || existingClient.companyType;
    const isMtditsaApplicable =
      companyType === CompanyType.SOLE_TRADER || companyType === CompanyType.PARTNERSHIP;

    if (data.mtditsaIncome !== undefined && isMtditsaApplicable) {
      const assessment = MTDITSAService.calculateStatus(data.mtditsaIncome, [], {
        isCharity: false, // Already filtered for SOLE_TRADER/PARTNERSHIP
      });
      mtditsaData = {
        mtditsaStatus: assessment.status,
        mtditsaEligible: assessment.isRequired,
      };
    } else if (data.mtditsaIncome !== undefined && !isMtditsaApplicable) {
      // If client type changed to non-applicable, reset MTD ITSA status
      mtditsaData = {
        mtditsaStatus: MTDITSAStatus.NOT_REQUIRED,
        mtditsaEligible: false,
      };
    }

    // Update client
    const { tags: updateTags, address: updateAddress, ...updateData } = data as any;
    const serialisedAddress = serialiseAddressForDb(updateAddress);
    const client = await prisma.client.update({
      where: { id },
      data: {
        ...updateData,
        ...mtditsaData,
        ...(serialisedAddress !== undefined ? { address: serialisedAddress } : {}),
        tags: updateTags ? updateTags.join(',') : undefined,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'CLIENT_UPDATED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `Updated client "${client.name}"`,
      },
    });

    res.json({
      success: true,
      data: formatClientForResponse(client),
    });
  })
);

/**
 * POST /api/clients/:id/mtditsa-assessment
 * Run MTD ITSA assessment for client
 * NOTE: MTD ITSA only applies to SOLE_TRADER and PARTNERSHIP entity types
 */
router.post(
  '/:id/mtditsa-assessment',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { incomeSources = [] } = z
      .object({
        incomeSources: z.array(incomeSourceSchema).optional(),
      })
      .parse(req.body);

    const client = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    // MTD ITSA only applies to sole traders and partnerships
    const isMtditsaApplicable =
      client.companyType === CompanyType.SOLE_TRADER ||
      client.companyType === CompanyType.PARTNERSHIP;

    if (!isMtditsaApplicable) {
      throw new ApiError(
        'NOT_APPLICABLE',
        `MTD ITSA does not apply to ${client.companyType.toLowerCase().replace('_', ' ')} entities. It only applies to sole traders and partnerships.`,
        400
      );
    }

    const annualIncome = client.mtditsaIncome || client.turnover || 0;

    const assessment = MTDITSAService.calculateStatus(
      annualIncome,
      incomeSources as Array<{
        type: 'SELF_EMPLOYMENT' | 'PROPERTY' | 'PARTNERSHIP' | 'OTHER';
        amount: number;
      }>,
      {
        isCharity: false, // Already validated as SOLE_TRADER or PARTNERSHIP
        partnershipTurnover: incomeSources.find((s) => s.type === 'PARTNERSHIP')?.amount,
      }
    );

    // Update client with new status
    await prisma.client.update({
      where: { id },
      data: {
        mtditsaStatus: assessment.status,
        mtditsaEligible: assessment.isRequired,
      },
    });

    res.json({
      success: true,
      data: {
        ...assessment,
        obligationExplanation: MTDITSAService.getObligationExplanation(assessment.status),
        softwareRecommendations: MTDITSAService.getSoftwareRecommendations(),
        serviceRecommendations: MTDITSAService.generateServiceRecommendations(assessment),
      },
    });
  })
);

/**
 * GET /api/clients/:id/mtditsa-timeline
 * Get MTD ITSA quarterly timeline for client
 */
router.get(
  '/:id/mtditsa-timeline',
  authenticate,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { taxYear = new Date().getFullYear() } = req.query;

    const client = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    const deadlines = MTDITSAService.calculateQuarterlyDeadlines(parseInt(taxYear as string));

    res.json({
      success: true,
      data: {
        taxYear: parseInt(taxYear as string),
        clientStatus: client.mtditsaStatus,
        isEligible: client.mtditsaEligible,
        quarterlyDeadlines: deadlines,
      },
    });
  })
);

/**
 * POST /api/clients/:id/verify-identity
 * ID verification stub — returns a verification link (W3.4)
 */
router.post(
  '/:id/verify-identity',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const client = await prisma.client.findFirst({
      where: { id, tenantId: req.tenantId, isActive: true },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    const { v4: uuidv4 } = await import('uuid');
    const verificationRef = `idv_stub_${uuidv4().replace(/-/g, '').slice(0, 16)}`;

    const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

    const verificationLink = `${frontendBase}/verify-identity/${verificationRef}?clientId=${client.id}`;

    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'ID_VERIFICATION_REQUESTED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `ID verification link issued for ${client.name}`,
        metadata: JSON.stringify({ verificationRef, isStub: true }),
      },
    });

    res.json({
      success: true,
      data: {
        clientId: client.id,
        verificationRef,
        verificationLink,
        isStub: true,
        expiresInHours: 72,
        message:
          'ID verification link generated (stub). Configure a live ID provider to enable automated checks.',
      },
      message: 'ID verification link created',
    });
  })
);

/**
 * DELETE /api/clients/:id
 * Soft delete client
 */
router.delete(
  '/:id',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!client) {
      throw new ApiError('NOT_FOUND', 'Client not found', 404);
    }

    // Soft delete
    await prisma.client.update({
      where: { id },
      data: { isActive: false },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        tenantId: req.tenantId,
        userId: req.user!.id,
        action: 'CLIENT_DELETED',
        entityType: 'CLIENT',
        entityId: client.id,
        description: `Deactivated client "${client.name}"`,
      },
    });

    res.json({
      success: true,
      data: { message: 'Client deactivated successfully' },
    });
  })
);

/**
 * GET /api/clients/validate/utr/:utr
 * Validate UTR format
 */
router.get(
  '/validate/utr/:utr',
  authenticate,
  asyncHandler(async (req, res) => {
    const { utr } = req.params;
    const isValid = validateUTR(utr);

    res.json({
      success: true,
      data: {
        utr,
        isValid,
        format: isValid ? 'Valid 10-digit UTR' : 'Invalid format',
      },
    });
  })
);

/**
 * GET /api/clients/validate/company-number/:number
 * Validate company number format
 */
router.get(
  '/validate/company-number/:number',
  authenticate,
  asyncHandler(async (req, res) => {
    const { number } = req.params;
    const isValid = validateCompanyNumber(number);

    res.json({
      success: true,
      data: {
        number,
        isValid,
        format: isValid ? 'Valid company number' : 'Invalid format',
      },
    });
  })
);

/**
 * GET /api/clients/:id/comms-timeline
 * Read-only email + SMS + dunning activity for client (W2.5 path).
 */
router.get(
  '/:id/comms-timeline',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const clientId = req.params.id;
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true, name: true, contactEmail: true, contactPhone: true },
    });
    if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

    const [emails, smsLogs, dunningLogs] = await Promise.all([
      prisma.emailLog.findMany({
        where: { tenantId, clientId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          messageType: true,
          status: true,
          to: true,
          subject: true,
          sentAt: true,
          createdAt: true,
          proposalId: true,
          error: true,
        },
      }),
      prisma.activityLog.findMany({
        where: {
          tenantId,
          action: { in: ['SMS_SENT', 'SMS_DRAFT'] },
          OR: [{ entityId: clientId }, { metadata: { contains: clientId } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          action: true,
          description: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.activityLog.findMany({
        where: {
          tenantId,
          action: {
            in: ['RECURRING_PAYMENT_FAILED', 'DUNNING_RETRY', 'DUNNING_PORTAL_OPENED'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          action: true,
          description: true,
          proposalId: true,
          createdAt: true,
          metadata: true,
        },
      }),
    ]);

    // Filter dunning to this client's proposals
    const proposalIds = await prisma.proposal.findMany({
      where: { tenantId, clientId },
      select: { id: true },
    });
    const pset = new Set(proposalIds.map((p) => p.id));
    const dunning = dunningLogs.filter((d) => d.proposalId && pset.has(d.proposalId));

    type Event = {
      id: string;
      channel: 'email' | 'sms' | 'dunning';
      at: string;
      title: string;
      detail: string;
      status?: string;
    };

    const events: Event[] = [];
    for (const e of emails) {
      events.push({
        id: e.id,
        channel: 'email',
        at: (e.sentAt || e.createdAt).toISOString(),
        title: e.subject,
        detail: `${e.messageType} → ${e.to}`,
        status: e.status,
      });
    }
    for (const s of smsLogs) {
      events.push({
        id: s.id,
        channel: 'sms',
        at: s.createdAt.toISOString(),
        title: s.action === 'SMS_SENT' ? 'SMS sent' : 'SMS draft',
        detail: s.description || '',
        status: s.action,
      });
    }
    for (const d of dunning) {
      events.push({
        id: d.id,
        channel: 'dunning',
        at: d.createdAt.toISOString(),
        title: d.action.replace(/_/g, ' '),
        detail: d.description || '',
        status: d.action,
      });
    }
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const twilioReady = Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
    );

    res.json({
      success: true,
      data: {
        client: {
          id: client.id,
          name: client.name,
          contactEmail: client.contactEmail,
          contactPhone: client.contactPhone,
        },
        smsConfigured: twilioReady,
        events: events.slice(0, 80),
      },
    });
  })
);

/**
 * POST /api/clients/:id/sms — send (or draft) SMS via Twilio when configured
 */
router.post(
  '/:id/sms',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const body = z
      .object({
        message: z.string().min(1).max(1600),
        send: z.boolean().optional().default(true),
      })
      .parse(req.body);

    const client = await prisma.client.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, name: true, contactPhone: true },
    });
    if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);
    if (!client.contactPhone) {
      throw new ApiError('NO_PHONE', 'Client has no phone number on file', 400);
    }

    let sent = false;
    if (body.send) {
      const { sendTwilioSms } = await import('../utils/twilioSms.js');
      sent = await sendTwilioSms(client.contactPhone, body.message);
    }

    await prisma.activityLog.create({
      data: {
        tenantId,
        action: sent ? 'SMS_SENT' : 'SMS_DRAFT',
        entityType: 'Client',
        entityId: client.id,
        description: sent
          ? `SMS to ${client.contactPhone}: ${body.message.slice(0, 120)}`
          : `SMS draft for ${client.name}: ${body.message.slice(0, 120)}`,
        metadata: JSON.stringify({
          clientId: client.id,
          phone: client.contactPhone,
          sent,
          fullMessage: body.message,
        }),
        userId: req.user?.id,
      },
    });

    res.json({
      success: true,
      data: {
        sent,
        phone: client.contactPhone,
        message: body.message,
      },
      message: sent ? 'SMS sent' : 'SMS saved as draft (Twilio not configured or send skipped)',
    });
  })
);

/**
 * Portal OS — staff: list / create tasks & messages for a client (ActivityLog-backed).
 */
router.get(
  '/:id/portal-os',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const clientId = req.params.id;
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: {
        id: true,
        name: true,
        portalEnabled: true,
        portalToken: true,
        portalTokenExpiry: true,
      },
    });
    if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

    const { listPortalTasks, listPortalMessages } = await import('../services/portalOsService.js');
    const [tasks, messages, files] = await Promise.all([
      listPortalTasks(tenantId, clientId),
      listPortalMessages(tenantId, clientId),
      prisma.portalFile.findMany({
        where: { tenantId, clientId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          name: true,
          mimeType: true,
          sizeBytes: true,
          uploadedBy: true,
          createdAt: true,
          jobId: true,
        },
      }),
    ]);

    const tokenValid =
      Boolean(client.portalToken) &&
      client.portalEnabled &&
      !!client.portalTokenExpiry &&
      client.portalTokenExpiry > new Date();

    res.json({
      success: true,
      data: {
        client: {
          id: client.id,
          name: client.name,
          portalEnabled: client.portalEnabled,
          hasPortalToken: Boolean(client.portalToken),
          portalTokenExpiry: client.portalTokenExpiry,
          portalActive: tokenValid,
        },
        tasks,
        messages,
        files,
      },
    });
  })
);

router.post(
  '/:id/portal-os/tasks',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const clientId = req.params.id;
    const schema = z.object({
      title: z.string().min(1).max(500),
      dueAt: z.string().datetime().optional().nullable(),
    });
    const body = schema.parse(req.body);
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true },
    });
    if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

    const { createPortalTask } = await import('../services/portalOsService.js');
    const user = req.user as { firstName?: string; lastName?: string; id?: string } | undefined;
    const authorName = user
      ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Staff'
      : 'Staff';
    const task = await createPortalTask({
      tenantId,
      clientId,
      title: body.title,
      dueAt: body.dueAt || null,
      from: 'staff',
      authorName,
      userId: user?.id || null,
    });
    res.status(201).json({ success: true, data: task });
  })
);

router.patch(
  '/:id/portal-os/tasks/:taskId',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const clientId = req.params.id;
    const taskId = req.params.taskId;
    const body = z.object({ done: z.boolean() }).parse(req.body);
    const { setPortalTaskDone } = await import('../services/portalOsService.js');
    const task = await setPortalTaskDone({
      tenantId,
      clientId,
      taskId,
      done: body.done,
    });
    if (!task) throw new ApiError('NOT_FOUND', 'Task not found', 404);
    res.json({ success: true, data: task });
  })
);

router.post(
  '/:id/portal-os/messages',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    const clientId = req.params.id;
    const body = z.object({ body: z.string().min(1).max(4000) }).parse(req.body);
    const client = await prisma.client.findFirst({
      where: { id: clientId, tenantId },
      select: { id: true },
    });
    if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

    const { createPortalMessage } = await import('../services/portalOsService.js');
    const user = req.user as { firstName?: string; lastName?: string; id?: string } | undefined;
    const authorName = user
      ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Staff'
      : 'Staff';
    const message = await createPortalMessage({
      tenantId,
      clientId,
      body: body.body,
      from: 'staff',
      authorName,
      userId: user?.id || null,
    });
    res.status(201).json({ success: true, data: message });
  })
);

export default router;
