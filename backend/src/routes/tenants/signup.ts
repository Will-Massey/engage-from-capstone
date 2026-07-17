import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database.js';
import { asyncHandler, ApiError } from '../../middleware/errorHandler.js';
import { allowPublicTenantSignup } from '../../utils/securityFlags.js';
import { emailVerificationService } from '../../services/emailVerificationService.js';
import { getEngageSuperadmin } from '../../lib/superadmin.js';
import { trialEndsAtFromNow } from '../../config/trial.js';
import logger from '../../config/logger.js';
import { scheduleTenantLibraryProvision } from '../../services/tenantLibraryProvisionService.js';

const router = Router();

// Validation schemas
const createTenantSchema = z.object({
  subdomain: z
    .string()
    .min(3, 'Subdomain must be at least 3 characters')
    .max(30, 'Subdomain must be at most 30 characters')
    .regex(/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens'),
  name: z.string().min(1, 'Company name is required'),
  adminEmail: z.string().email('Invalid admin email'),
  adminFirstName: z.string().min(1, 'Admin first name is required'),
  adminLastName: z.string().min(1, 'Admin last name is required'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  settings: z
    .object({
      defaultCurrency: z.string().default('GBP'),
      vatRegistered: z.boolean().default(true),
      professionalBody: z
        .enum(['ACCA', 'ICAEW', 'AAT', 'CIMA', 'ICAS', 'ATT', 'CIOT', 'CTA', 'CPAA'])
        .optional(),
      companyRegistration: z.string().optional(),
      vatNumber: z.string().optional(),
      address: z
        .object({
          line1: z.string(),
          line2: z.string().optional(),
          city: z.string(),
          postcode: z.string(),
          country: z.string().default('United Kingdom'),
        })
        .optional(),
    })
    .optional(),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  logo: z.string().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  settings: z
    .object({
      defaultCurrency: z.string().optional(),
      defaultPaymentTerms: z.number().optional(),
      vatRegistered: z.boolean().optional(),
      professionalBody: z
        .enum(['ACCA', 'ICAEW', 'AAT', 'CIMA', 'ICAS', 'ATT', 'CIOT', 'CTA', 'CPAA'])
        .optional(),
      companyRegistration: z.string().optional(),
      vatNumber: z.string().optional(),
      address: z
        .object({
          line1: z.string(),
          line2: z.string().optional(),
          city: z.string(),
          postcode: z.string(),
          country: z.string(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * POST /api/tenants
 * Create new tenant (public endpoint for onboarding)
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!allowPublicTenantSignup) {
      throw new ApiError(
        'SIGNUP_DISABLED',
        'Public practice registration is disabled. Contact support to create an account.',
        403
      );
    }

    const data = createTenantSchema.parse(req.body);

    // Check subdomain availability
    const existingTenant = await prisma.tenant.findUnique({
      where: { subdomain: data.subdomain },
    });

    if (existingTenant) {
      throw new ApiError('SUBDOMAIN_TAKEN', 'This subdomain is already in use', 409);
    }

    // Check if email already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: data.adminEmail.toLowerCase() },
    });

    if (existingUser) {
      throw new ApiError('EMAIL_EXISTS', 'An account with this email already exists', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.adminPassword, 12);

    const trialEndsAt = trialEndsAtFromNow();

    // Create tenant and admin user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create tenant with free trial
      const tenant = await tx.tenant.create({
        data: {
          subdomain: data.subdomain,
          name: data.name,
          primaryColor: data.primaryColor || '#0ea5e9',
          settings: data.settings as any,
          subscriptionStatus: 'trial',
          subscriptionTier: 'PROFESSIONAL',
          trialEndsAt,
        },
      });

      // Create admin user
      const user = await tx.user.create({
        data: {
          email: data.adminEmail.toLowerCase(),
          passwordHash,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          role: 'PARTNER',
          tenantId: tenant.id,
          isActive: true,
        },
      });

      // Create default service templates for the tenant
      await createDefaultServices(tx, tenant.id);

      return { tenant, user };
    });

    // Email verification required before first sign-in — no session is issued
    // here. The admin user was created with emailVerified null; the login gate
    // holds until they follow the emailed link.
    await emailVerificationService.sendVerificationEmail(
      {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        tenantId: result.tenant.id,
      },
      result.tenant.name
    );

    scheduleTenantLibraryProvision(result.tenant.id, result.user.id);

    const superadmin = getEngageSuperadmin();
    if (superadmin) {
      try {
        await superadmin.reportSignup({
          tenantId: result.tenant.id,
          name: result.tenant.name,
          email: result.user.email,
          plan: 'trial',
        });
        await superadmin.reportTrialStarted({
          tenantId: result.tenant.id,
          name: result.tenant.name,
          trialEndsAt: trialEndsAt.toISOString(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('[tenants] Superadmin trial reporting failed:', message);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        requiresVerification: true,
        email: result.user.email,
      },
    });
  })
);

/**
 * GET /api/tenants/check-subdomain/:subdomain
 * Check if subdomain is available
 */
router.get(
  '/check-subdomain/:subdomain',
  asyncHandler(async (req, res) => {
    const { subdomain } = req.params;

    // Validate subdomain format
    const subdomainRegex = /^[a-z0-9-]{3,30}$/;
    if (!subdomainRegex.test(subdomain)) {
      res.json({
        success: true,
        data: {
          available: false,
          reason: 'Invalid format. Use 3-30 lowercase letters, numbers, and hyphens only.',
        },
      });
      return;
    }

    const existing = await prisma.tenant.findUnique({
      where: { subdomain },
    });

    res.json({
      success: true,
      data: {
        available: !existing,
        subdomain,
      },
    });
  })
);

/**
 * GET /api/tenants/onboarding-status
 * Get tenant onboarding checklist
 */
router.get(
  '/onboarding-status',
  asyncHandler(async (req, res) => {
    // This would typically be authenticated, but for demo we return mock data
    res.json({
      success: true,
      data: {
        steps: [
          { id: 'company_info', label: 'Company Information', completed: false },
          { id: 'branding', label: 'Branding & Logo', completed: false },
          { id: 'team', label: 'Add Team Members', completed: false },
          { id: 'services', label: 'Configure Services', completed: false },
          { id: 'templates', label: 'Set Up Templates', completed: false },
          { id: 'first_proposal', label: 'Create First Proposal', completed: false },
        ],
      },
    });
  })
);

/**
 * Helper function to create default service templates
 */
async function createDefaultServices(tx: any, tenantId: string) {
  const defaultServices = [
    // COMPLIANCE SERVICES
    {
      category: 'COMPLIANCE',
      name: 'Annual Accounts Preparation',
      description: 'Preparation and filing of statutory annual accounts with Companies House',
      longDescription:
        'Comprehensive preparation of your annual statutory accounts in accordance with UK GAAP or FRS 102, including all necessary disclosures and notes. Filing with Companies House included.',
      basePrice: 750,
      baseHours: 5,
      frequencyOptions: ['ANNUALLY'],
      defaultFrequency: 'ANNUALLY',
      applicableEntityTypes: ['LIMITED_COMPANY', 'LLP'],
      complexityFactors: [
        { name: 'transaction_volume', description: 'High transaction volume', multiplier: 1.3 },
        { name: 'group_structure', description: 'Group/consolidation required', multiplier: 1.5 },
      ],
      deliverables: [
        'Draft accounts for review',
        'Final statutory accounts',
        'Companies House filing confirmation',
      ],
      tags: ['accounts', 'compliance', 'companies-house'],
    },
    {
      category: 'COMPLIANCE',
      name: 'Corporation Tax Return (CT600)',
      description: 'Preparation and submission of Corporation Tax Return to HMRC',
      longDescription:
        'Complete preparation of your CT600 corporation tax return, including tax computations, capital allowances claims, and optimisation advice.',
      basePrice: 600,
      baseHours: 4,
      frequencyOptions: ['ANNUALLY'],
      defaultFrequency: 'ANNUALLY',
      applicableEntityTypes: ['LIMITED_COMPANY'],
      complexityFactors: [
        { name: 'rd_claim', description: 'R&D tax credit claim', multiplier: 1.4 },
        { name: 'group_relief', description: 'Group relief considerations', multiplier: 1.3 },
      ],
      deliverables: [
        'Tax computation',
        'CT600 form',
        'iXBRL accounts',
        'HMRC submission confirmation',
      ],
      tags: ['tax', 'ct600', 'hmrc', 'compliance'],
    },
    {
      category: 'COMPLIANCE',
      name: 'Confirmation Statement',
      description: 'Annual Confirmation Statement filing with Companies House',
      longDescription:
        'Review and filing of your annual Confirmation Statement (CS01), ensuring all company information is up to date.',
      basePrice: 75,
      baseHours: 0.5,
      frequencyOptions: ['ANNUALLY'],
      defaultFrequency: 'ANNUALLY',
      applicableEntityTypes: ['LIMITED_COMPANY', 'LLP'],
      deliverables: ['Filing confirmation', 'Updated company record'],
      tags: ['confirmation-statement', 'companies-house', 'compliance'],
    },
    {
      category: 'COMPLIANCE',
      name: 'Self Assessment Tax Return',
      description: 'Personal tax return preparation for sole traders and individuals',
      longDescription:
        'Complete Self Assessment tax return preparation including all income sources, allowances, and reliefs.',
      basePrice: 250,
      baseHours: 2,
      frequencyOptions: ['ANNUALLY'],
      defaultFrequency: 'ANNUALLY',
      applicableEntityTypes: ['SOLE_TRADER', 'PARTNERSHIP', 'LIMITED_COMPANY'],
      complexityFactors: [
        { name: 'property_income', description: 'Rental property income', multiplier: 1.3 },
        { name: 'foreign_income', description: 'Foreign income sources', multiplier: 1.5 },
        { name: 'capital_gains', description: 'Capital gains calculations', multiplier: 1.4 },
      ],
      deliverables: ['Tax computation', 'SA100 return', 'HMRC submission confirmation'],
      tags: ['self-assessment', 'tax', 'hmrc', 'personal-tax'],
    },
    {
      category: 'COMPLIANCE',
      name: 'VAT Return',
      description: 'Quarterly or monthly VAT return preparation and submission',
      longDescription:
        'Preparation and submission of your VAT returns, including reconciliation, MTD compliance, and advice on VAT schemes.',
      basePrice: 150,
      baseHours: 1.5,
      pricingModel: 'PER_TRANSACTION',
      frequencyOptions: ['MONTHLY', 'QUARTERLY'],
      defaultFrequency: 'QUARTERLY',
      applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP'],
      complexityFactors: [
        {
          name: 'partial_exemption',
          description: 'Partial exemption calculations',
          multiplier: 1.5,
        },
        { name: 'eu_trade', description: 'EU/international trade', multiplier: 1.3 },
      ],
      deliverables: ['VAT reconciliation', 'VAT return filing', 'MTD submission confirmation'],
      tags: ['vat', 'mtd', 'hmrc', 'compliance'],
    },
    {
      category: 'COMPLIANCE',
      name: 'Payroll Processing',
      description: 'Monthly payroll processing including payslips and RTI submissions',
      longDescription:
        'Complete payroll service including payslip generation, RTI submissions to HMRC, and year-end reporting.',
      basePrice: 25,
      baseHours: 0.5,
      pricingModel: 'PER_EMPLOYEE',
      frequencyOptions: ['WEEKLY', 'MONTHLY'],
      defaultFrequency: 'MONTHLY',
      applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP', 'LLP'],
      complexityFactors: [
        { name: 'auto_enrolment', description: 'Pension auto-enrolment', multiplier: 1.2 },
        { name: 'directors', description: 'Director-only payroll', multiplier: 0.8 },
      ],
      deliverables: ['Payslips', 'RTI submissions', 'P32 report', 'P60s annually'],
      tags: ['payroll', 'rti', 'hmrc', 'employees'],
    },
    {
      category: 'COMPLIANCE',
      name: 'Bookkeeping',
      description: 'Monthly or quarterly bookkeeping service',
      longDescription:
        'Regular bookkeeping service to keep your accounts up to date, including bank reconciliation and expense categorisation.',
      basePrice: 200,
      baseHours: 2,
      frequencyOptions: ['MONTHLY', 'QUARTERLY'],
      defaultFrequency: 'MONTHLY',
      applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP', 'LLP'],
      complexityFactors: [
        { name: 'transaction_volume', description: '>100 transactions/month', multiplier: 1.4 },
        { name: 'multiple_accounts', description: 'Multiple bank accounts', multiplier: 1.2 },
      ],
      deliverables: ['Reconciled accounts', 'Management reports', 'VAT-ready records'],
      tags: ['bookkeeping', 'accounts', 'reconciliation'],
    },
    // MTD ITSA Service
    {
      category: 'COMPLIANCE',
      name: 'MTD ITSA Quarterly Submissions',
      description: 'Making Tax Digital quarterly income tax submissions',
      longDescription:
        'Quarterly submission service for Making Tax Digital for Income Tax Self Assessment (MTD ITSA). Includes review, calculation, and submission of quarterly updates to HMRC.',
      basePrice: 100,
      baseHours: 1,
      frequencyOptions: ['QUARTERLY'],
      defaultFrequency: 'QUARTERLY',
      applicableEntityTypes: ['SOLE_TRADER', 'PARTNERSHIP'],
      complexityFactors: [
        { name: 'multiple_sources', description: 'Multiple income sources', multiplier: 1.3 },
        { name: 'property_portfolio', description: 'Property portfolio', multiplier: 1.4 },
      ],
      deliverables: ['Quarterly summary', 'HMRC submission confirmation', 'Tax estimate'],
      regulatoryNotes:
        'Required from April 2026 for sole traders and landlords with income over £50,000',
      tags: ['mtd', 'itsa', 'quarterly', 'hmrc', 'digital-tax'],
    },
    // ADVISORY SERVICES
    {
      category: 'ADVISORY',
      name: 'Management Accounts',
      description: 'Monthly or quarterly management accounts and reporting',
      longDescription:
        'Regular management accounts providing insight into your business performance, including profit & loss, balance sheet, and key metrics.',
      basePrice: 350,
      baseHours: 3,
      frequencyOptions: ['MONTHLY', 'QUARTERLY'],
      defaultFrequency: 'QUARTERLY',
      applicableEntityTypes: ['LIMITED_COMPANY', 'PARTNERSHIP', 'LLP'],
      complexityFactors: [
        { name: 'consolidation', description: 'Multi-entity consolidation', multiplier: 1.5 },
      ],
      deliverables: ['Management accounts pack', 'Variance analysis', 'KPI dashboard'],
      tags: ['management-accounts', 'reporting', 'advisory'],
    },
    {
      category: 'ADVISORY',
      name: 'Business Tax Planning',
      description: 'Strategic tax planning and optimisation advice',
      longDescription:
        'Proactive tax planning to minimise your tax liability while remaining fully compliant. Includes annual planning meeting and implementation support.',
      basePrice: 500,
      baseHours: 4,
      frequencyOptions: ['ANNUALLY'],
      defaultFrequency: 'ANNUALLY',
      applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP', 'LLP'],
      deliverables: ['Tax planning report', 'Recommendations schedule', 'Implementation guide'],
      tags: ['tax-planning', 'advisory', 'strategy'],
    },
    // TECHNICAL SERVICES
    {
      category: 'TECHNICAL',
      name: 'R&D Tax Credit Claim',
      description: 'Research & Development tax credit claim preparation',
      longDescription:
        'Full R&D tax credit claim service including technical report preparation, cost analysis, and HMRC submission.',
      basePrice: 2000,
      baseHours: 15,
      frequencyOptions: ['ANNUALLY'],
      defaultFrequency: 'ANNUALLY',
      applicableEntityTypes: ['LIMITED_COMPANY'],
      complexityFactors: [
        { name: 'large_project', description: 'Multiple projects', multiplier: 1.4 },
      ],
      deliverables: [
        'Technical narrative',
        'Cost breakdown',
        'CT600 amendment',
        'HMRC correspondence',
      ],
      tags: ['rnd', 'tax-credits', 'innovation', 'hmrc'],
    },
  ];

  for (const service of defaultServices) {
    const row = service as {
      category: string;
      name: string;
      description: string;
      longDescription?: string;
      basePrice: number;
      baseHours: number;
      frequencyOptions: string[];
      defaultFrequency: string;
      applicableEntityTypes: string[];
      complexityFactors?: unknown[];
      requirements?: unknown[];
      deliverables?: unknown[];
      tags?: string[];
      regulatoryNotes?: string;
    };

    await tx.serviceTemplate.create({
      data: {
        category: row.category,
        name: row.name,
        description: row.description,
        longDescription: row.longDescription,
        basePrice: row.basePrice,
        baseHours: row.baseHours,
        frequencyOptions: row.frequencyOptions.join(','),
        defaultFrequency: row.defaultFrequency,
        applicableEntityTypes: row.applicableEntityTypes.join(','),
        complexityFactors: JSON.stringify(row.complexityFactors ?? []),
        requirements: JSON.stringify(row.requirements ?? []),
        deliverables: JSON.stringify(row.deliverables ?? []),
        tags: (row.tags ?? []).join(','),
        regulatoryNotes: row.regulatoryNotes,
        tenantId,
        isActive: true,
      },
    });
  }
}

export default router;
