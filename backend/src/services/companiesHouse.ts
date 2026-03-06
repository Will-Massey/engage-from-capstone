/**
 * Companies House API Integration
 * Provides company lookup and details retrieval
 * https://developer.company-information.service.gov.uk/
 */

import logger from '../config/logger.js';

const COMPANIES_HOUSE_API_URL = 'https://api.company-information.service.gov.uk';

export interface CompaniesHouseConfig {
  apiKey: string;
}

export interface CompanySearchResult {
  company_number: string;
  company_name?: string;  // Not present in search results, only in details
  title?: string;         // Search results use 'title' instead of 'company_name'
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
}

export class CompaniesHouseService {
  private apiKey: string;

  constructor(config: CompaniesHouseConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Search for companies by name or number
   */
  async searchCompanies(query: string, itemsPerPage: number = 10): Promise<CompanySearchResult[]> {
    try {
      const url = `${COMPANIES_HOUSE_API_URL}/search/companies?q=${encodeURIComponent(query)}&items_per_page=${itemsPerPage}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid Companies House API key');
        }
        throw new Error(`Companies House API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.items || [];
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
      // Clean company number (remove spaces)
      const cleanNumber = companyNumber.replace(/\s/g, '').toUpperCase();
      
      const url = `${COMPANIES_HOUSE_API_URL}/company/${cleanNumber}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
          'Content-Type': 'application/json',
        },
      });

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
      'ltd': 'LIMITED_COMPANY',
      'plc': 'LIMITED_COMPANY',
      'limited-partnership': 'PARTNERSHIP',
      'llp': 'LLP',
      'private-limited-guarant-nsc': 'LIMITED_COMPANY',
      'private-limited-guarant-nsc-limited-exemption': 'LIMITED_COMPANY',
      'private-limited-shares-section-30-exemption': 'LIMITED_COMPANY',
      'private-unlimited-nsc': 'LIMITED_COMPANY',
      'old-public-company': 'LIMITED_COMPANY',
      'protected-cell-company': 'LIMITED_COMPANY',
      'royal-charter': 'CHARITY',
      'investment-company-with-variable-capital': 'LIMITED_COMPANY',
      'unregistered-company': 'SOLE_TRADER',
      'other': 'SOLE_TRADER',
      'european-public-limited-liability-company-se': 'LIMITED_COMPANY',
      'registered-society-non-jurisdictional': 'CHARITY',
      'scottish-partnership': 'PARTNERSHIP',
      'scottish-qualified-partnership': 'PARTNERSHIP',
      'registered-overseas-entity': 'LIMITED_COMPANY',
    };
    
    return typeMap[chType] || 'LIMITED_COMPANY';
  }
}

// Factory function for creating service from environment
export function createCompaniesHouseService(): CompaniesHouseService | null {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  
  if (!apiKey) {
    logger.warn('Companies House API key not configured');
    return null;
  }
  
  return new CompaniesHouseService({ apiKey });
}

export default CompaniesHouseService;
