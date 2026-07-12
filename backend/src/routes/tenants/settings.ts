import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { validateTenantLogoForStorage } from '../../utils/tenantLogoConstraints.js';

const router = Router();

/**
 * GET /api/tenants/settings
 * Get tenant settings (authenticated)
 */
router.get(
  '/settings',
  authenticate,
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        logo: true,
        primaryColor: true,
        secondaryColor: true,
        vatRegistered: true,
        vatNumber: true,
        defaultVatRate: true,
        autoApplyVat: true,
        settings: true,
      },
    });

    if (!tenant) {
      throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const settings = JSON.parse(tenant.settings || '{}');

    res.json({
      success: true,
      data: {
        ...settings,
        vat: {
          vatRegistered: tenant.vatRegistered,
          vatNumber: tenant.vatNumber,
          defaultVatRate: tenant.defaultVatRate,
          autoApplyVat: tenant.autoApplyVat,
        },
        branding: {
          name: tenant.name,
          logo: tenant.logo,
          primaryColor: tenant.primaryColor,
          secondaryColor: tenant.secondaryColor,
        },
      },
    });
  })
);

/**
 * PUT /api/tenants/settings
 * Update tenant settings (authenticated)
 */
router.put(
  '/settings',
  authenticate,
  authorize('ADMIN', 'PARTNER', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;

    const schema = z.object({
      vat: z
        .object({
          vatRegistered: z.boolean().optional(),
          vatNumber: z.string().optional(),
          defaultVatRate: z.enum(['ZERO', 'REDUCED_5', 'STANDARD_20', 'EXEMPT']).optional(),
          autoApplyVat: z.boolean().optional(),
        })
        .optional(),
      branding: z
        .object({
          name: z.string().optional(),
          logo: z.string().optional(),
          primaryColor: z
            .string()
            .regex(/^#[0-9A-Fa-f]{6}$/)
            .optional(),
          secondaryColor: z
            .string()
            .regex(/^#[0-9A-Fa-f]{6}$/)
            .optional(),
        })
        .optional(),
      email: z
        .object({
          provider: z.enum(['smtp', 'gmail', 'outlook', 'microsoft365']).optional(),
          fromName: z.string().optional(),
          fromEmail: z.string().email().optional(),
          smtp: z
            .object({
              host: z.string(),
              port: z.number(),
              secure: z.boolean(),
              user: z.string(),
              pass: z.string(),
            })
            .optional(),
          gmail: z
            .object({
              clientId: z.string(),
              clientSecret: z.string(),
              refreshToken: z.string(),
              user: z.string().email(),
            })
            .optional(),
          outlook: z
            .object({
              clientId: z.string(),
              clientSecret: z.string(),
              refreshToken: z.string(),
              user: z.string().email(),
            })
            .optional(),
        })
        .optional(),
      notifications: z
        .object({
          proposalAccepted: z.boolean().optional(),
          proposalViewed: z.boolean().optional(),
          mtditsaDeadlines: z.boolean().optional(),
          weeklySummary: z.boolean().optional(),
        })
        .optional(),
      proposals: z
        .object({
          defaultExpiryDays: z.number().int().min(1).max(365).optional(),
          chaseSequenceDays: z.array(z.number().int().min(1).max(90)).max(10).optional(),
          chaseSequenceEnabled: z.boolean().optional(),
          renewalReminderDays: z.number().int().min(1).max(90).optional(),
          defaultPaymentTermsDays: z.number().int().min(1).max(90).optional(),
          cancellationNoticeDays: z.number().int().min(1).max(365).optional(),
          termsSource: z.enum(['engage_default', 'custom']).optional(),
          customTerms: z.string().max(50000).nullable().optional(),
          benchmarksOptIn: z.boolean().optional(),
          blockSendUntilAmlCleared: z.boolean().optional(),
        })
        .optional(),
      payments: z
        .object({
          collectPaymentAtSign: z.boolean().optional(),
          allowDirectDebit: z.boolean().optional(),
          allowCard: z.boolean().optional(),
        })
        .optional(),
      clara: z
        .object({
          agenticDraftingEnabled: z.boolean().optional(),
          draftRegulatoryFamilies: z
            .array(z.enum(['vat', 'mtd_itsa', 'filing_deadlines', 'payroll']))
            .max(4)
            .optional(),
          draftRenewals: z.boolean().optional(),
          renewalUpliftPercent: z.number().min(-50).max(100).optional(),
          useAiCoverLetter: z.boolean().optional(),
          draftOwnerUserId: z.string().uuid().nullable().optional(),
          maxDraftsPerRun: z.number().int().min(1).max(50).optional(),
        })
        .optional(),
      professionalBody: z
        .enum(['ACCA', 'ICAEW', 'ICAS', 'CIMA', 'AAT', 'ATT', 'CIOT', 'CPAA', 'OTHER'])
        .optional(),
      companyRegistration: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      address: z
        .object({
          line1: z.string(),
          line2: z.string().optional(),
          city: z.string(),
          postcode: z.string(),
          country: z.string(),
        })
        .optional(),
      insurerName: z.string().optional(),
      governingLaw: z.enum(['England and Wales', 'Scotland', 'Northern Ireland']).optional(),
      fcaAuthorised: z.boolean().optional(),
      privacyPolicyUrl: z.string().optional(),
      termsVersion: z.string().optional(),
      whiteLabel: z
        .object({
          customDomain: z.string().max(255).optional(),
          hideCapstoneBranding: z.boolean().optional(),
          portalTitle: z.string().max(120).optional(),
        })
        .optional(),
    });

    const data = schema.parse(req.body);

    if (data.branding?.logo !== undefined) {
      const logoCheck = validateTenantLogoForStorage(data.branding.logo);
      if (logoCheck.ok === false) {
        throw new ApiError('VALIDATION_ERROR', logoCheck.message, 400);
      }
      data.branding.logo = logoCheck.logo;
    }

    // Get current settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const currentSettings = JSON.parse(tenant?.settings || '{}');

    // Merge new settings
    const updatedSettings = {
      ...currentSettings,
      vat: data.vat || currentSettings.vat,
      branding: data.branding || currentSettings.branding,
      email: data.email || currentSettings.email,
      notifications: data.notifications ?? currentSettings.notifications,
      proposals: data.proposals
        ? { ...(currentSettings.proposals || {}), ...data.proposals }
        : currentSettings.proposals,
      payments: data.payments
        ? { ...(currentSettings.payments || {}), ...data.payments }
        : currentSettings.payments,
      clara: data.clara
        ? { ...(currentSettings.clara || {}), ...data.clara }
        : currentSettings.clara,
      professionalBody: data.professionalBody || currentSettings.professionalBody,
      companyRegistration: data.companyRegistration || currentSettings.companyRegistration,
      phone: data.phone || currentSettings.phone,
      website: data.website || currentSettings.website,
      address: data.address || currentSettings.address,
      insurerName: data.insurerName || currentSettings.insurerName,
      governingLaw: data.governingLaw || currentSettings.governingLaw,
      fcaAuthorised: data.fcaAuthorised || currentSettings.fcaAuthorised,
      privacyPolicyUrl: data.privacyPolicyUrl || currentSettings.privacyPolicyUrl,
      termsVersion: data.termsVersion || currentSettings.termsVersion,
      whiteLabel: data.whiteLabel
        ? { ...(currentSettings.whiteLabel || {}), ...data.whiteLabel }
        : currentSettings.whiteLabel,
    };

    // Update tenant
    const updateData: any = {
      settings: JSON.stringify(updatedSettings),
    };

    // Update VAT fields if provided
    if (data.vat) {
      if (data.vat.vatRegistered !== undefined) updateData.vatRegistered = data.vat.vatRegistered;
      if (data.vat.vatNumber !== undefined) updateData.vatNumber = data.vat.vatNumber;
      if (data.vat.defaultVatRate !== undefined)
        updateData.defaultVatRate = data.vat.defaultVatRate;
      if (data.vat.autoApplyVat !== undefined) updateData.autoApplyVat = data.vat.autoApplyVat;
    }

    // Update branding fields if provided
    if (data.branding) {
      if (data.branding.name !== undefined) updateData.name = data.branding.name;
      if (data.branding.logo !== undefined) updateData.logo = data.branding.logo;
      if (data.branding.primaryColor !== undefined)
        updateData.primaryColor = data.branding.primaryColor;
      if (data.branding.secondaryColor !== undefined)
        updateData.secondaryColor = data.branding.secondaryColor;
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    res.json({
      success: true,
      data: {
        vat: {
          vatRegistered: updatedTenant.vatRegistered,
          vatNumber: updatedTenant.vatNumber,
          defaultVatRate: updatedTenant.defaultVatRate,
          autoApplyVat: updatedTenant.autoApplyVat,
        },
        branding: {
          name: updatedTenant.name,
          logo: updatedTenant.logo,
          primaryColor: updatedTenant.primaryColor,
          secondaryColor: updatedTenant.secondaryColor,
        },
      },
      message: 'Settings saved successfully',
    });
  })
);

export default router;
