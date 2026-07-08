/** Companies House API types — aligned with backend routes and enrichment service. */

import type { AiCompaniesHouseContext } from './ai';

export interface CompaniesHouseStatusResult {
  configured: boolean;
  connected?: boolean;
  message: string;
}

export interface CompaniesHouseAddress {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  postal_code?: string;
  country?: string;
  premises?: string;
  region?: string;
}

export interface CompaniesHouseSearchResult {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string;
  dateOfCreation: string;
  address?: CompaniesHouseAddress;
}

export interface CompaniesHouseFormattedAddress {
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
}

export interface CompaniesHouseFormattedClient {
  name: string;
  companyNumber: string;
  companyType: string;
  address: CompaniesHouseFormattedAddress;
  yearEnd?: string;
  status: string;
}

export interface CompaniesHouseCompanyResult {
  raw: Record<string, unknown>;
  formatted: CompaniesHouseFormattedClient;
}

export interface CompaniesHouseMatch {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string;
  dateOfCreation?: string;
}

/** Alias used by Clara client brief / enrichment snapshots */
export type CompaniesHouseSnapshot = AiCompaniesHouseContext;

export interface EnrichCompaniesHousePayload {
  companyNumber?: string;
  searchByName?: boolean;
  fillMissingOnly?: boolean;
}

export interface EnrichedClientSummary {
  id: string;
  name: string;
  companyNumber?: string | null;
  industry?: string | null;
  yearEnd?: string | null;
  employeeCount?: number | null;
  turnover?: number | null;
  notes?: string | null;
}

export interface EnrichCompaniesHouseResult {
  enriched: boolean;
  needsSelection?: boolean;
  matches?: CompaniesHouseMatch[];
  companiesHouse?: CompaniesHouseSnapshot;
  client?: EnrichedClientSummary;
  matchedBy?: 'number' | 'search' | 'provided';
}

export interface ClientCompaniesHouseResponse {
  data: CompaniesHouseSnapshot | null;
  configured: boolean;
}
