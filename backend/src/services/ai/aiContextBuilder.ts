/**
 * Central AI context assembly — tenant-scoped client, catalog, proposals, and CH data.
 */
import { prisma } from '../../config/database.js';
import { ApiError } from '../../middleware/errorHandler.js';
import { createCompaniesHouseService } from '../companiesHouse.js';
import { mapDetailsToAiContext } from '../companiesHouseEnrichment.js';

export interface BuildAiContextOptions {
  clientId?: string;
  proposalId?: string;
  userId?: string;
}

export interface AiTenantContext {
  id: string;
  name: string;
  logo?: string | null;
  primaryColor: string;
}

export interface AiClientContext {
  id: string;
  name: string;
  companyType: string;
  contactName?: string | null;
  contactEmail: string;
  companyNumber?: string | null;
  vatNumber?: string | null;
  vatRegistered: boolean;
  mtditsaStatus: string;
  turnover?: number | null;
  employeeCount?: number | null;
  industry?: string | null;
  yearEnd?: string | null;
  notes?: string | null;
}

export interface AiUserContext {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
  role: string;
}

export interface AiCatalogSnippetItem {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultPrice: number;
  defaultBilling: string;
  allowedBilling: string[];
  tags: string;
}

export interface AiPriorProposalSummary {
  id: string;
  reference: string;
  title: string;
  status: string;
  total: number;
  validUntil: string;
  sentAt?: string | null;
  acceptedAt?: string | null;
  services: Array<{ name: string; billingFrequency: string; displayPrice: number }>;
}

export interface AiProposalContext {
  id: string;
  reference: string;
  title: string;
  status: string;
  total: number;
  validUntil: string;
  coverLetter?: string | null;
  sentAt?: string | null;
  services: Array<{
    name: string;
    billingFrequency: string;
    displayPrice: number;
    description?: string | null;
  }>;
}

export interface AiCompaniesHouseContext {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string;
  dateOfCreation: string;
  registeredOfficeAddress?: string;
  sicCodes?: string[];
  accountsNextDue?: string;
}

export interface BuildAiContextResult {
  tenant: AiTenantContext;
  client?: AiClientContext;
  user?: AiUserContext;
  proposal?: AiProposalContext;
  catalog: AiCatalogSnippetItem[];
  priorProposals: AiPriorProposalSummary[];
  companiesHouse?: AiCompaniesHouseContext;
}

function mapCatalogItem(
  s: {
    id: string;
    name: string;
    category: string;
    description: string;
    priceAmount: number;
    basePrice: number;
    billingCycle: string;
    defaultFrequency: string;
    frequencyOptions: string | null;
    tags: string;
  }
): AiCatalogSnippetItem {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    defaultPrice: s.priceAmount || s.basePrice || 0,
    defaultBilling: s.billingCycle || s.defaultFrequency || 'MONTHLY',
    allowedBilling: (s.frequencyOptions || 'MONTHLY,QUARTERLY,ANNUALLY')
      .split(',')
      .map((x) => x.trim()),
    tags: s.tags,
  };
}

function mapClient(client: {
  id: string;
  name: string;
  companyType: string;
  contactName: string | null;
  contactEmail: string;
  companyNumber: string | null;
  vatNumber: string | null;
  vatRegistered: boolean;
  mtditsaStatus: string;
  turnover: number | null;
  employeeCount: number | null;
  industry: string | null;
  yearEnd: string | null;
  notes: string | null;
}): AiClientContext {
  return {
    id: client.id,
    name: client.name,
    companyType: client.companyType,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    companyNumber: client.companyNumber,
    vatNumber: client.vatNumber,
    vatRegistered: client.vatRegistered,
    mtditsaStatus: client.mtditsaStatus,
    turnover: client.turnover,
    employeeCount: client.employeeCount,
    industry: client.industry,
    yearEnd: client.yearEnd,
    notes: client.notes,
  };
}

async function loadCompaniesHouse(companyNumber: string): Promise<AiCompaniesHouseContext | undefined> {
  const ch = createCompaniesHouseService();
  if (!ch) return undefined;

  try {
    const details = await ch.getCompanyDetails(companyNumber);
    return mapDetailsToAiContext(details);
  } catch {
    return undefined;
  }
}

/**
 * Build tenant-scoped context for Clara AI features.
 */
export async function buildAiContext(
  tenantId: string,
  options: BuildAiContextOptions = {}
): Promise<BuildAiContextResult> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, isActive: true },
    select: { id: true, name: true, logo: true, primaryColor: true },
  });
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);

  let resolvedClientId = options.clientId;

  let proposal: AiProposalContext | undefined;
  if (options.proposalId) {
    const row = await prisma.proposal.findFirst({
      where: { id: options.proposalId, tenantId },
      include: { services: true },
    });
    if (!row) throw new ApiError('NOT_FOUND', 'Proposal not found', 404);
    resolvedClientId = row.clientId;
    proposal = {
      id: row.id,
      reference: row.reference,
      title: row.title,
      status: row.status,
      total: row.total,
      validUntil: row.validUntil.toISOString().slice(0, 10),
      coverLetter: row.coverLetter,
      sentAt: row.sentAt?.toISOString() ?? null,
      services: row.services.map((s) => ({
        name: s.name,
        billingFrequency: s.billingFrequency,
        displayPrice: s.displayPrice || s.unitPrice,
        description: s.description,
      })),
    };
  }

  let client: AiClientContext | undefined;
  if (resolvedClientId) {
    const row = await prisma.client.findFirst({
      where: { id: resolvedClientId, tenantId },
    });
    if (!row) throw new ApiError('CLIENT_NOT_FOUND', 'Client not found', 404);
    client = mapClient(row);
  }

  let user: AiUserContext | undefined;
  if (options.userId) {
    const row = await prisma.user.findFirst({
      where: { id: options.userId, tenantId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
        role: true,
      },
    });
    if (row) {
      user = {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        jobTitle: row.jobTitle,
        role: row.role,
      };
    }
  }

  const catalogRows = await prisma.serviceTemplate.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      priceAmount: true,
      basePrice: true,
      billingCycle: true,
      defaultFrequency: true,
      frequencyOptions: true,
      tags: true,
    },
    take: 50,
    orderBy: { name: 'asc' },
  });
  const catalog = catalogRows.map(mapCatalogItem);

  let priorProposals: AiPriorProposalSummary[] = [];
  if (resolvedClientId) {
    const rows = await prisma.proposal.findMany({
      where: { tenantId, clientId: resolvedClientId },
      include: { services: { select: { name: true, billingFrequency: true, displayPrice: true, unitPrice: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    priorProposals = rows.map((p) => ({
      id: p.id,
      reference: p.reference,
      title: p.title,
      status: p.status,
      total: p.total,
      validUntil: p.validUntil.toISOString().slice(0, 10),
      sentAt: p.sentAt?.toISOString() ?? null,
      acceptedAt: p.acceptedAt?.toISOString() ?? null,
      services: p.services.map((s) => ({
        name: s.name,
        billingFrequency: s.billingFrequency,
        displayPrice: s.displayPrice || s.unitPrice,
      })),
    }));
  }

  let companiesHouse: AiCompaniesHouseContext | undefined;
  if (client?.companyNumber) {
    companiesHouse = await loadCompaniesHouse(client.companyNumber);
  }

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      logo: tenant.logo,
      primaryColor: tenant.primaryColor,
    },
    client,
    user,
    proposal,
    catalog,
    priorProposals,
    companiesHouse,
  };
}