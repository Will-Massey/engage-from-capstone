/**
 * Enrich Engage client records from Companies House API data.
 */
import { prisma } from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  createCompaniesHouseService,
  type CompanyDetails,
  type CompanySearchResult,
} from './companiesHouse.js';
import type { AiCompaniesHouseContext } from './ai/aiContextBuilder.js';

/** Common SIC codes for UK accountancy clients — extend as needed */
const SIC_DESCRIPTIONS: Record<string, string> = {
  '41100': 'Development of building projects',
  '41201': 'Construction of commercial buildings',
  '41202': 'Construction of domestic buildings',
  '42110': 'Construction of roads and motorways',
  '43999': 'Other specialised construction activities',
  '45111': 'Sale of new cars and light motor vehicles',
  '45112': 'Sale of used cars and light motor vehicles',
  '45200': 'Maintenance and repair of motor vehicles',
  '47110': 'Retail sale in non-specialised stores',
  '47190': 'Other retail sale in non-specialised stores',
  '47710': 'Retail sale of clothing',
  '47910': 'Retail sale via mail order or internet',
  '56101': 'Licensed restaurants',
  '56102': 'Unlicensed restaurants and cafes',
  '56210': 'Event catering activities',
  '62012': 'Business and domestic software development',
  '62020': 'Information technology consultancy activities',
  '62090': 'Other information technology service activities',
  '68100': 'Buying and selling of own real estate',
  '68201': 'Renting and operating of housing association real estate',
  '68209': 'Other letting and operating of own real estate',
  '69102': 'Solicitors',
  '69201': 'Accounting and auditing activities',
  '69202': 'Bookkeeping activities',
  '70221': 'Financial management',
  '70229': 'Management consultancy activities (other)',
  '71121': 'Engineering design activities',
  '71122': 'Engineering related scientific and technical consulting',
  '74909': 'Other professional, scientific and technical activities',
  '82990': 'Other business support service activities',
  '85590': 'Other education n.e.c.',
  '86900': 'Other human health activities',
};

export interface CompaniesHouseMatch {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string;
  dateOfCreation?: string;
}

export interface EnrichCompaniesHouseOptions {
  companyNumber?: string;
  /** When true, search CH by client name if no number on record */
  searchByName?: boolean;
  /** Only fill empty client fields (default true) */
  fillMissingOnly?: boolean;
}

export interface EnrichCompaniesHouseResult {
  enriched: boolean;
  needsSelection?: boolean;
  matches?: CompaniesHouseMatch[];
  companiesHouse?: AiCompaniesHouseContext;
  client?: Record<string, unknown>;
  matchedBy?: 'number' | 'search' | 'provided';
}

function formatChAddress(details: CompanyDetails): string | undefined {
  const a = details.registered_office_address;
  if (!a) return undefined;
  return [a.address_line_1, a.address_line_2, a.locality, a.region, a.postal_code]
    .filter(Boolean)
    .join(', ');
}

export function mapDetailsToAiContext(details: CompanyDetails): AiCompaniesHouseContext {
  return {
    companyNumber: details.company_number,
    companyName: details.company_name,
    companyStatus: details.company_status,
    companyType: details.company_type,
    dateOfCreation: details.date_of_creation,
    registeredOfficeAddress: formatChAddress(details),
    sicCodes: details.sic_codes,
    accountsNextDue: details.accounts?.next_due,
  };
}

export function sicCodesToIndustry(sicCodes?: string[]): string | undefined {
  if (!sicCodes?.length) return undefined;
  return sicCodes
    .map((code) => {
      const normalised = code.replace(/\D/g, '').padStart(5, '0').slice(-5);
      const desc = SIC_DESCRIPTIONS[normalised] || SIC_DESCRIPTIONS[code];
      return desc ? `${desc} (SIC ${code})` : `SIC ${code}`;
    })
    .join('; ');
}

function normaliseCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bltd\b|\blimited\b|\bplc\b|\bllp\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function pickBestSearchMatch(
  clientName: string,
  results: CompanySearchResult[]
): CompanySearchResult | null {
  if (!results.length) return null;

  const target = normaliseCompanyName(clientName);
  const scored = results.map((r) => {
    const title = r.title || r.company_name || '';
    const norm = normaliseCompanyName(title);
    let score = 0;
    if (norm === target) score += 100;
    else if (norm.includes(target) || target.includes(norm)) score += 60;
    if (r.company_status === 'active') score += 20;
    if (r.company_status === 'dissolved') score -= 30;
    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 40) return null;

  const closeMatches = scored.filter((s) => s.score >= best.score - 5 && s.score >= 40);
  if (closeMatches.length > 1) {
    const sameNumber = new Set(closeMatches.map((s) => s.r.company_number));
    if (sameNumber.size > 1) return null;
  }

  return best.r;
}

function toMatch(r: CompanySearchResult): CompaniesHouseMatch {
  return {
    companyNumber: r.company_number,
    companyName: r.title || r.company_name || r.company_number,
    companyStatus: r.company_status,
    companyType: r.company_type,
    dateOfCreation: r.date_of_creation,
  };
}

async function resolveCompanyNumber(
  ch: NonNullable<ReturnType<typeof createCompaniesHouseService>>,
  clientName: string,
  existingNumber: string | null | undefined,
  options: EnrichCompaniesHouseOptions
): Promise<{ number: string; matchedBy: 'number' | 'search' | 'provided'; matches?: CompaniesHouseMatch[] }> {
  if (options.companyNumber?.trim()) {
    return { number: options.companyNumber.trim().toUpperCase(), matchedBy: 'provided' };
  }
  if (existingNumber?.trim()) {
    return { number: existingNumber.trim().toUpperCase(), matchedBy: 'number' };
  }
  if (!options.searchByName || !clientName.trim()) {
    throw new ApiError(
      'COMPANY_NUMBER_REQUIRED',
      'Add a company number or enable search by client name',
      400
    );
  }

  const results = await ch.searchCompanies(clientName.trim(), 8);
  const active = results.filter((r) => r.company_status !== 'dissolved');
  const pool = active.length > 0 ? active : results;

  if (pool.length === 0) {
    throw new ApiError('NOT_FOUND', 'No Companies House match for this client name', 404);
  }

  const best = pickBestSearchMatch(clientName, pool);
  if (!best) {
    return {
      number: '',
      matchedBy: 'search',
      matches: pool.slice(0, 5).map(toMatch),
    };
  }

  return { number: best.company_number, matchedBy: 'search' };
}

/**
 * Fetch Companies House data for a client and optionally persist to the client record.
 */
export async function enrichClientFromCompaniesHouse(
  tenantId: string,
  clientId: string,
  options: EnrichCompaniesHouseOptions = {}
): Promise<EnrichCompaniesHouseResult> {
  const fillMissingOnly = options.fillMissingOnly !== false;

  const ch = createCompaniesHouseService();
  if (!ch) {
    throw new ApiError(
      'NOT_CONFIGURED',
      'Companies House API not configured. Set COMPANIES_HOUSE_API_KEY on the server.',
      503
    );
  }

  const client = await prisma.client.findFirst({ where: { id: clientId, tenantId } });
  if (!client) throw new ApiError('NOT_FOUND', 'Client not found', 404);

  const resolved = await resolveCompanyNumber(ch, client.name, client.companyNumber, options);

  if (!resolved.number && resolved.matches?.length) {
    return {
      enriched: false,
      needsSelection: true,
      matches: resolved.matches,
    };
  }

  const details = await ch.getCompanyDetails(resolved.number);
  const formatted = ch.formatForClientCreation(details);
  const companiesHouse = mapDetailsToAiContext(details);
  const industryFromSic = sicCodesToIndustry(details.sic_codes);

  const updateData: Record<string, unknown> = {};

  if (!fillMissingOnly || !client.companyNumber) {
    updateData.companyNumber = formatted.companyNumber;
  }
  if (!fillMissingOnly || !client.yearEnd) {
    if (formatted.yearEnd) updateData.yearEnd = formatted.yearEnd;
  }
  if (!fillMissingOnly || !client.industry) {
    if (industryFromSic) updateData.industry = industryFromSic;
  }
  if (!fillMissingOnly || !client.address) {
    if (formatted.address?.line1 || formatted.address?.postcode) {
      updateData.address = JSON.stringify(formatted.address);
    }
  }

  let updatedClient = client;
  if (Object.keys(updateData).length > 0) {
    updatedClient = await prisma.client.update({
      where: { id: clientId },
      data: updateData,
    });
  }

  return {
    enriched: true,
    matchedBy: resolved.matchedBy,
    companiesHouse,
    client: {
      id: updatedClient.id,
      name: updatedClient.name,
      companyNumber: updatedClient.companyNumber,
      industry: updatedClient.industry,
      yearEnd: updatedClient.yearEnd,
      employeeCount: updatedClient.employeeCount,
      turnover: updatedClient.turnover,
      notes: updatedClient.notes,
    },
  };
}

/**
 * Read-only Companies House snapshot for a client (no DB writes).
 */
export async function getClientCompaniesHouseSnapshot(
  tenantId: string,
  clientId: string,
  companyNumber?: string
): Promise<AiCompaniesHouseContext | null> {
  const ch = createCompaniesHouseService();
  if (!ch) return null;

  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: { companyNumber: true },
  });
  if (!client) return null;

  const number = (companyNumber || client.companyNumber)?.trim();
  if (!number) return null;

  try {
    const details = await ch.getCompanyDetails(number);
    return mapDetailsToAiContext(details);
  } catch {
    return null;
  }
}