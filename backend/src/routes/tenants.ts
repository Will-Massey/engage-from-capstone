import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { generateToken, authenticate } from '../middleware/auth.js';


const router = Router();

// Validation schemas
const createTenantSchema = z.object({
  subdomain: z.string()
    .min(3, 'Subdomain must be at least 3 characters')
    .max(30, 'Subdomain must be at most 30 characters')
    .regex(/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens'),
  name: z.string().min(1, 'Company name is required'),
  adminEmail: z.string().email('Invalid admin email'),
  adminFirstName: z.string().min(1, 'Admin first name is required'),
  adminLastName: z.string().min(1, 'Admin last name is required'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  settings: z.object({
    defaultCurrency: z.string().default('GBP'),
    vatRegistered: z.boolean().default(true),
    professionalBody: z.enum(['ACCA', 'ICAEW', 'AAT', 'CIMA', 'ICAS', 'CTA', 'CPAA']).optional(),
    companyRegistration: z.string().optional(),
    vatNumber: z.string().optional(),
    address: z.object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      postcode: z.string(),
      country: z.string().default('United Kingdom'),
    }).optional(),
  }).optional(),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  logo: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  settings: z.object({
    defaultCurrency: z.string().optional(),
    defaultPaymentTerms: z.number().optional(),
    vatRegistered: z.boolean().optional(),
    professionalBody: z.enum(['ACCA', 'ICAEW', 'AAT', 'CIMA', 'ICAS', 'CTA', 'CPAA']).optional(),
    companyRegistration: z.string().optional(),
    vatNumber: z.string().optional(),
    address: z.object({
      line1: z.string(),
      line2: z.string().optional(),
      city: z.string(),
      postcode: z.string(),
      country: z.string(),
    }).optional(),
  }).optional(),
});

/**
 * POST /api/tenants
 * Create new tenant (public endpoint for onboarding)
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
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

    // Create tenant and admin user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create tenant
      const tenant = await tx.tenant.create({
        data: {
          subdomain: data.subdomain,
          name: data.name,
          primaryColor: data.primaryColor || '#0ea5e9',
          settings: data.settings as any,
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

    // Generate token
    const token = generateToken({
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      role: result.user.role,
      tenantId: result.user.tenantId,
    });

    res.status(201).json({
      success: true,
      data: {
        tenant: {
          id: result.tenant.id,
          subdomain: result.tenant.subdomain,
          name: result.tenant.name,
          primaryColor: result.tenant.primaryColor,
          settings: result.tenant.settings,
        },
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
        },
        token,
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
      longDescription: 'Comprehensive preparation of your annual statutory accounts in accordance with UK GAAP or FRS 102, including all necessary disclosures and notes. Filing with Companies House included.',
      basePrice: 750,
      baseHours: 5,
      frequencyOptions: ['ANNUALLY'],
      defaultFrequency: 'ANNUALLY',
      applicableEntityTypes: ['LIMITED_COMPANY', 'LLP'],
      complexityFactors: [
        { name: 'transaction_volume', description: 'High transaction volume', multiplier: 1.3 },
        { name: 'group_structure', description: 'Group/consolidation required', multiplier: 1.5 },
      ],
      deliverables: ['Draft accounts for review', 'Final statutory accounts', 'Companies House filing confirmation'],
      tags: ['accounts', 'compliance', 'companies-house'],
    },
    {
      category: 'COMPLIANCE',
      name: 'Corporation Tax Return (CT600)',
      description: 'Preparation and submission of Corporation Tax Return to HMRC',
      longDescription: 'Complete preparation of your CT600 corporation tax return, including tax computations, capital allowances claims, and optimisation advice.',
      basePrice: 600,
      baseHours: 4,
      frequencyOptions: ['ANNUALLY'],
      defaultFrequency: 'ANNUALLY',
      applicableEntityTypes: ['LIMITED_COMPANY'],
      complexityFactors: [
        { name: 'rd_claim', description: 'R&D tax credit claim', multiplier: 1.4 },
        { name: 'group_relief', description: 'Group relief considerations', multiplier: 1.3 },
      ],
      deliverables: ['Tax computation', 'CT600 form', 'iXBRL accounts', 'HMRC submission confirmation'],
      tags: ['tax', 'ct600', 'hmrc', 'compliance'],
    },
    {
      category: 'COMPLIANCE',
      name: 'Confirmation Statement',
      description: 'Annual Confirmation Statement filing with Companies House',
      longDescription: 'Review and filing of your annual Confirmation Statement (CS01), ensuring all company information is up to date.',
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
      longDescription: 'Complete Self Assessment tax return preparation including all income sources, allowances, and reliefs.',
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
      longDescription: 'Preparation and submission of your VAT returns, including reconciliation, MTD compliance, and advice on VAT schemes.',
      basePrice: 150,
      baseHours: 1.5,
      pricingModel: 'PER_TRANSACTION',
      frequencyOptions: ['MONTHLY', 'QUARTERLY'],
      defaultFrequency: 'QUARTERLY',
      applicableEntityTypes: ['LIMITED_COMPANY', 'SOLE_TRADER', 'PARTNERSHIP'],
      complexityFactors: [
        { name: 'partial_exemption', description: 'Partial exemption calculations', multiplier: 1.5 },
        { name: 'eu_trade', description: 'EU/international trade', multiplier: 1.3 },
      ],
      deliverables: ['VAT reconciliation', 'VAT return filing', 'MTD submission confirmation'],
      tags: ['vat', 'mtd', 'hmrc', 'compliance'],
    },
    {
      category: 'COMPLIANCE',
      name: 'Payroll Processing',
      description: 'Monthly payroll processing including payslips and RTI submissions',
      longDescription: 'Complete payroll service including payslip generation, RTI submissions to HMRC, and year-end reporting.',
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
      longDescription: 'Regular bookkeeping service to keep your accounts up to date, including bank reconciliation and expense categorisation.',
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
      longDescription: 'Quarterly submission service for Making Tax Digital for Income Tax Self Assessment (MTD ITSA). Includes review, calculation, and submission of quarterly updates to HMRC.',
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
      regulatoryNotes: 'Required from April 2026 for sole traders and landlords with income over £50,000',
      tags: ['mtd', 'itsa', 'quarterly', 'hmrc', 'digital-tax'],
    },
    // ADVISORY SERVICES
    {
      category: 'ADVISORY',
      name: 'Management Accounts',
      description: 'Monthly or quarterly management accounts and reporting',
      longDescription: 'Regular management accounts providing insight into your business performance, including profit & loss, balance sheet, and key metrics.',
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
      longDescription: 'Proactive tax planning to minimise your tax liability while remaining fully compliant. Includes annual planning meeting and implementation support.',
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
      longDescription: 'Full R&D tax credit claim service including technical report preparation, cost analysis, and HMRC submission.',
      basePrice: 2000,
      baseHours: 15,
      frequencyOptions: ['ANNUALLY'],
      defaultFrequency: 'ANNUALLY',
      applicableEntityTypes: ['LIMITED_COMPANY'],
      complexityFactors: [
        { name: 'large_project', description: 'Multiple projects', multiplier: 1.4 },
      ],
      deliverables: ['Technical narrative', 'Cost breakdown', 'CT600 amendment', 'HMRC correspondence'],
      tags: ['rnd', 'tax-credits', 'innovation', 'hmrc'],
    },
  ];

  for (const service of defaultServices) {
    await tx.serviceTemplate.create({
      data: {
        ...service,
        tenantId,
        complexityFactors: (service as any).complexityFactors || [],
        requirements: (service as any).requirements || [],
        deliverables: (service as any).deliverables || [],
        tags: (service as any).tags || [],
        isActive: true,
      },
    });
  }
}

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
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!;
    
    const schema = z.object({
      vat: z.object({
        vatRegistered: z.boolean().optional(),
        vatNumber: z.string().optional(),
        defaultVatRate: z.enum(['ZERO', 'REDUCED_5', 'STANDARD_20', 'EXEMPT']).optional(),
        autoApplyVat: z.boolean().optional(),
      }).optional(),
      branding: z.object({
        name: z.string().optional(),
        logo: z.string().optional(),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      }).optional(),
      email: z.object({
        provider: z.enum(['smtp', 'gmail', 'outlook', 'microsoft365']).optional(),
        fromName: z.string().optional(),
        fromEmail: z.string().email().optional(),
        smtp: z.object({
          host: z.string(),
          port: z.number(),
          secure: z.boolean(),
          user: z.string(),
          pass: z.string(),
        }).optional(),
        gmail: z.object({
          clientId: z.string(),
          clientSecret: z.string(),
          refreshToken: z.string(),
          user: z.string().email(),
        }).optional(),
        outlook: z.object({
          clientId: z.string(),
          clientSecret: z.string(),
          refreshToken: z.string(),
          user: z.string().email(),
        }).optional(),
      }).optional(),
      notifications: z.object({
        proposalAccepted: z.boolean().optional(),
        proposalViewed: z.boolean().optional(),
        mtditsaDeadlines: z.boolean().optional(),
        weeklySummary: z.boolean().optional(),
      }).optional(),
      professionalBody: z.enum(['ACCA', 'ICAEW', 'ICAS', 'CIMA', 'AAT', 'CPAA', 'OTHER']).optional(),
      companyRegistration: z.string().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      address: z.object({
        line1: z.string(),
        line2: z.string().optional(),
        city: z.string(),
        postcode: z.string(),
        country: z.string(),
      }).optional(),
      insurerName: z.string().optional(),
      governingLaw: z.enum(['England and Wales', 'Scotland', 'Northern Ireland']).optional(),
      fcaAuthorised: z.boolean().optional(),
      privacyPolicyUrl: z.string().optional(),
      termsVersion: z.string().optional(),
    });

    const data = schema.parse(req.body);

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
      notifications: data.notifications || currentSettings.notifications,
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
    };

    // Update tenant
    const updateData: any = {
      settings: JSON.stringify(updatedSettings),
    };

    // Update VAT fields if provided
    if (data.vat) {
      if (data.vat.vatRegistered !== undefined) updateData.vatRegistered = data.vat.vatRegistered;
      if (data.vat.vatNumber !== undefined) updateData.vatNumber = data.vat.vatNumber;
      if (data.vat.defaultVatRate !== undefined) updateData.defaultVatRate = data.vat.defaultVatRate;
      if (data.vat.autoApplyVat !== undefined) updateData.autoApplyVat = data.vat.autoApplyVat;
    }

    // Update branding fields if provided
    if (data.branding) {
      if (data.branding.name !== undefined) updateData.name = data.branding.name;
      if (data.branding.logo !== undefined) updateData.logo = data.branding.logo;
      if (data.branding.primaryColor !== undefined) updateData.primaryColor = data.branding.primaryColor;
      if (data.branding.secondaryColor !== undefined) updateData.secondaryColor = data.branding.secondaryColor;
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
