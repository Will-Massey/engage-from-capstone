/**
 * Companies House API Integration
 * Provides company lookup and details retrieval
 * https://developer.company-information.service.gov.uk/
 */

import { z } from 'zod';
import logger from '../config/logger.js';

/** Express query values can be string | string[] — coerce before search. */
export const companiesHouseSearchQuerySchema = z.object({
  q: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value[0] : value)?.trim() ?? '')
    .pipe(z.string().min(1).max(160)),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const COMPANIES_HOUSE_API_URL = 'https://api.company-information.service.gov.uk';
const CH_USER_AGENT =
  'CapstoneEngage/1.0 (https://capstonesoftware.co.uk/engage; sales@capstonesoftware.co.uk)';

/** Strip spaces/hyphens, uppercase, and pad a UK company number to CH's 8-char form. */
export function normalizeCompanyNumber(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[\s-]/g, '').toUpperCase();
  if (!cleaned) return null;

  if (/^\d{1,8}$/.test(cleaned)) {
    return cleaned.padStart(8, '0');
  }

  // Prefix forms: SC, NI, OC, SO, FC, IP, LP, SL, …
  const prefixed = cleaned.match(/^([A-Z]{1,2})(\d{4,6})$/);
  if (prefixed) {
    return `${prefixed[1]}${prefixed[2].padStart(6, '0')}`;
  }

  return null;
}

export function looksLikeCompanyNumber(raw: string): boolean {
  return normalizeCompanyNumber(raw) !== null && raw.replace(/[\s-]/g, '').length >= 6;
}

export function companyNumberFromSearchItem(item: {
  company_number?: string;
  links?: { self?: string };
}): string {
  const fromField = normalizeCompanyNumber(item.company_number);
  if (fromField) return fromField;
  const self = item.links?.self || '';
  const match = self.match(/\/company\/([^/?#]+)/i);
  return normalizeCompanyNumber(match?.[1] || '') || (item.company_number || '').trim();
}

export interface CompaniesHouseConfig {
  apiKey: string;
}

export interface CompanySearchResult {
  company_number: string;
  company_name?: string; // Not present in search results, only in details
  title?: string; // Search results use 'title' instead of 'company_name'
  company_status: string;
  company_type: string;
  date_of_creation: string;
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    postal_code?: string;
    country?: string;
  };
  // Search results may have address in different format
  address?: {
    address_line_1?: string;
    locality?: string;
    postal_code?: string;
    premises?: string;
    region?: string;
  };
}

export interface CompanyDetails {
  company_number: string;
  company_name: string;
  company_status: string;
  company_type: string;
  date_of_creation: string;
  registered_office_address: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  sic_codes?: string[];
  accounts?: {
    accounting_reference_date?: {
      month: string;
      day: string;
    };
    next_due?: string;
  };
  confirmation_statement?: {
    next_due?: string;
    last_made_up_to?: string;
  };
}

export class CompaniesHouseService {
  private apiKey: string;

  constructor(config: CompaniesHouseConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Search for companies by name or number
   */
  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`,
      Accept: 'application/json',
      'User-Agent': CH_USER_AGENT,
    };
  }

  private async chFetch(url: string): Promise<Response> {
    const response = await fetch(url, { headers: this.authHeaders() });
    if (response.status === 429) {
      throw new Error('Companies House rate limit reached — try again in a minute');
    }
    return response;
  }

  /**
   * Search for companies by name or number.
   * Number-shaped queries also hit the company profile endpoint — search can
   * miss an exact registration number that the profile API knows.
   */
  async searchCompanies(query: string, itemsPerPage: number = 10): Promise<CompanySearchResult[]> {
    try {
      const trimmed = (query || '').trim();
      const url = `${COMPANIES_HOUSE_API_URL}/search/companies?q=${encodeURIComponent(trimmed)}&items_per_page=${itemsPerPage}`;

      const response = await this.chFetch(url);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid Companies House API key');
        }
        throw new Error(`Companies House API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { items?: CompanySearchResult[] };
      const items = (data.items || []).map((item) => ({
        ...item,
        company_number: companyNumberFromSearchItem(item) || item.company_number,
      }));

      if (looksLikeCompanyNumber(trimmed)) {
        const direct = await this.tryCompanyDetails(trimmed);
        if (direct) {
          const already = items.some(
            (item) =>
              normalizeCompanyNumber(item.company_number) ===
              normalizeCompanyNumber(direct.company_number)
          );
          if (!already) {
            items.unshift({
              company_number: direct.company_number,
              company_name: direct.company_name,
              title: direct.company_name,
              company_status: direct.company_status,
              company_type: direct.company_type,
              date_of_creation: direct.date_of_creation,
              registered_office_address: direct.registered_office_address,
            });
          }
        }
      }

      return items;
    } catch (error) {
      logger.error('Companies House search error:', error);
      throw error;
    }
  }

  /**
   * Get detailed company information by company number
   */
  async getCompanyDetails(companyNumber: string): Promise<CompanyDetails> {
    try {
      const cleanNumber =
        normalizeCompanyNumber(companyNumber) || companyNumber.replace(/\s/g, '').toUpperCase();

      const url = `${COMPANIES_HOUSE_API_URL}/company/${encodeURIComponent(cleanNumber)}`;

      const response = await this.chFetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Company not found');
        }
        if (response.status === 401) {
          throw new Error('Invalid Companies House API key');
        }
        throw new Error(`Companies House API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data as CompanyDetails;
    } catch (error) {
      logger.error('Companies House get details error:', error);
      throw error;
    }
  }

  private async tryCompanyDetails(companyNumber: string): Promise<CompanyDetails | null> {
    try {
      return await this.getCompanyDetails(companyNumber);
    } catch (error: any) {
      if (error?.message === 'Company not found') return null;
      throw error;
    }
  }

  /**
   * Format company data for client creation
   */
  formatForClientCreation(company: CompanyDetails) {
    const address = company.registered_office_address || {};

    return {
      name: company.company_name,
      companyNumber: company.company_number,
      companyType: this.mapCompanyType(company.company_type),
      address: {
        line1: address.address_line_1 || '',
        line2: address.address_line_2 || '',
        city: address.locality || '',
        postcode: address.postal_code || '',
        country: address.country || 'United Kingdom',
      },
      yearEnd: company.accounts?.accounting_reference_date
        ? `${company.accounts.accounting_reference_date.month}-${company.accounts.accounting_reference_date.day}`
        : undefined,
      status: company.company_status,
    };
  }

  /**
   * Map Companies House company type to internal enum
   */
  private mapCompanyType(chType: string): string {
    const typeMap: Record<string, string> = {
      'private-unlimited': 'LIMITED_COMPANY',
      ltd: 'LIMITED_COMPANY',
      plc: 'LIMITED_COMPANY',
      'limited-partnership': 'PARTNERSHIP',
      llp: 'LLP',
      'private-limited-guarant-nsc': 'LIMITED_COMPANY',
      'private-limited-guarant-nsc-limited-exemption': 'LIMITED_COMPANY',
      'private-limited-shares-section-30-exemption': 'LIMITED_COMPANY',
      'private-unlimited-nsc': 'LIMITED_COMPANY',
      'old-public-company': 'LIMITED_COMPANY',
      'protected-cell-company': 'LIMITED_COMPANY',
      'royal-charter': 'CHARITY',
      'investment-company-with-variable-capital': 'LIMITED_COMPANY',
      'unregistered-company': 'SOLE_TRADER',
      other: 'SOLE_TRADER',
      'european-public-limited-liability-company-se': 'LIMITED_COMPANY',
      'registered-society-non-jurisdictional': 'CHARITY',
      'scottish-partnership': 'PARTNERSHIP',
      'scottish-qualified-partnership': 'PARTNERSHIP',
      'registered-overseas-entity': 'LIMITED_COMPANY',
    };

    return typeMap[chType] || 'LIMITED_COMPANY';
  }
}

const PLACEHOLDER_KEYS = new Set([
  '',
  'your_api_key_here',
  'changeme',
  'xxx',
  'test',
  'null',
  'undefined',
]);

function normalizeApiKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed || trimmed.length < 8) return null;
  if (PLACEHOLDER_KEYS.has(trimmed.toLowerCase())) return null;
  if (/your[_-]?api[_-]?key/i.test(trimmed)) return null;
  return trimmed;
}

// Factory function for creating service from environment
export function createCompaniesHouseService(): CompaniesHouseService | null {
  const apiKey = normalizeApiKey(process.env.COMPANIES_HOUSE_API_KEY);

  if (!apiKey) {
    logger.warn(
      'Companies House API key not configured — set COMPANIES_HOUSE_API_KEY in backend/.env (get a free key at https://developer.company-information.service.gov.uk/)'
    );
    return null;
  }

  return new CompaniesHouseService({ apiKey });
}

export default CompaniesHouseService;
