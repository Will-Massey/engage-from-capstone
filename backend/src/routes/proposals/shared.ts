import { z } from 'zod';
import { ApprovalStatus, ProposalStatus, PricingFrequency, UserRole } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { getProposalSettings } from '../../utils/tenantProposalSettings.js';
import { formatUserRole } from '../../utils/proposalDisplay.js';

// generateReference helper function
export const generateReference = (prefix: string = 'PROP'): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

/** YYYY-MM-DD or ISO datetime; only stored for ONE_TIME lines */
export function parseOneOffDueDate(billingFrequency: string, raw: unknown): Date | null {
  if (billingFrequency !== 'ONE_TIME') return null;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00.000Z`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const APPROVER_ROLES: UserRole[] = ['ADMIN', 'PARTNER', 'MD', 'MANAGER'];
const PARTNER_OVERRIDE_ROLES: UserRole[] = ['ADMIN', 'PARTNER', 'MD'];
export const SUBMITTER_ROLES: UserRole[] = ['JUNIOR', 'SENIOR'];

export function canOverrideApproval(role: UserRole): boolean {
  return PARTNER_OVERRIDE_ROLES.includes(role);
}

export function canSendProposal(role: UserRole, approvalStatus: ApprovalStatus): boolean {
  if (canOverrideApproval(role)) {
    return true;
  }
  return approvalStatus === 'APPROVED';
}

/**
 * Approval + AML gates that must pass before a DRAFT proposal can be sent —
 * shared by the email-send path and the copy-link-marks-sent path so both
 * enforce identical rules (a link copy is a send, not a backdoor around them).
 * Throws the same ApiErrors as the /send handler. Subscription/trial is
 * enforced separately via assertTenantCanSendProposals.
 */
export function assertProposalSendable(
  proposal: {
    approvalStatus: ApprovalStatus;
    client: { amlStatus: string | null };
    tenant: { settings: string | null };
  },
  userRole: UserRole,
  opts: { overrideAml?: boolean } = {}
): void {
  const overrideApproval = canOverrideApproval(userRole);

  if (proposal.approvalStatus === 'PENDING' && !overrideApproval) {
    throw new ApiError(
      'APPROVAL_PENDING',
      'This proposal is awaiting partner approval and cannot be sent yet',
      403
    );
  }
  if (proposal.approvalStatus === 'REJECTED' && !overrideApproval) {
    throw new ApiError(
      'APPROVAL_REJECTED',
      'This proposal was rejected. Revise and resubmit for partner approval before sending',
      403
    );
  }
  if (!canSendProposal(userRole, proposal.approvalStatus)) {
    throw new ApiError(
      'APPROVAL_REQUIRED',
      'Partner approval is required before this proposal can be sent',
      403
    );
  }

  const settings = getProposalSettings(proposal.tenant.settings);
  const amlBlocked = settings.blockSendUntilAmlCleared && proposal.client.amlStatus !== 'CLEAR';
  const amlOverrideUsed = amlBlocked && opts.overrideAml === true && overrideApproval;
  if (amlBlocked && !amlOverrideUsed) {
    throw new ApiError(
      'AML_NOT_CLEARED',
      `AML clearance is required before sending. The client's AML status is ${proposal.client.amlStatus}.`,
      403
    );
  }
}

export async function resolveSenderPosition(
  userId: string,
  role: UserRole
): Promise<string | undefined> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { jobTitle: true, role: true },
  });
  return user?.jobTitle?.trim() || formatUserRole(user?.role || role);
}

export const proposalApprovalInclude = {
  approvedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} as const;

const pricingTierSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  feeMultiplier: z.number().min(0).optional(),
  serviceLineIds: z.array(z.string()).optional(),
});

export const proposalCustomFieldsSchema = z
  .object({
    offerThreePackages: z.boolean().optional(),
    pricingTiers: z.array(pricingTierSchema).optional(),
    requiredSigners: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .optional();

// Validation schemas
export const createProposalSchema = z.object({
  clientId: z.string(),
  title: z.string().min(1, 'Title is required'),
  templateId: z.string().optional(),
  services: z
    .array(
      z.object({
        serviceId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        quantity: z.number().min(1).default(1),
        unitPrice: z.number().min(0).optional(), // Allow custom unit price
        discountPercent: z.number().min(0).max(100).optional(),
        frequency: z.nativeEnum(PricingFrequency).optional(), // Billing frequency per service
        billingFrequency: z.nativeEnum(PricingFrequency).optional(), // Frontend sends this
        displayPrice: z.number().min(0).optional(), // Custom price from frontend
        vatRate: z.number().min(0).max(100).optional(), // Per-line VAT rate
        oneOffDueDate: z.union([z.string(), z.null()]).optional(),
      })
    )
    .min(1, 'At least one service is required'),
  validUntil: z.union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  contractStartDate: z
    .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
  paymentTerms: z.string().optional(),
  paymentFrequency: z.nativeEnum(PricingFrequency).optional(),
  coverLetter: z.string().optional(),
  proposalSummary: z.string().max(4000).optional(),
  engagementLetter: z.string().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountValue: z.number().min(0).optional(),
  customFields: proposalCustomFieldsSchema,
});

export const updateProposalSchema = z.object({
  title: z.string().min(1).optional(),
  services: z
    .array(
      z.object({
        serviceId: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        quantity: z.number().min(1),
        discountPercent: z.number().min(0).max(100).optional(),
        // v2 pricing fields
        vatRate: z.number().min(0).max(100).optional(),
        billingFrequency: z
          .enum(['ONE_TIME', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'])
          .optional(),
        displayPrice: z.number().min(0).optional(),
        oneOffDueDate: z.union([z.string(), z.null()]).optional(),
      })
    )
    .optional(),
  validUntil: z.union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  contractStartDate: z
    .union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
  paymentTerms: z.string().optional(),
  coverLetter: z.string().optional(),
  proposalSummary: z.string().max(4000).optional(),
  engagementLetter: z.string().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  status: z.nativeEnum(ProposalStatus).optional(),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).optional(),
  discountValue: z.number().min(0).optional(),
  customFields: proposalCustomFieldsSchema,
});
