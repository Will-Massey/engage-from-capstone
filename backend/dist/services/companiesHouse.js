"use strict";
/**
 * Companies House API Integration
 * Provides company lookup and details retrieval
 * https://developer.company-information.service.gov.uk/
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompaniesHouseService = void 0;
exports.createCompaniesHouseService = createCompaniesHouseService;
const logger_js_1 = __importDefault(require("../config/logger.js"));
const COMPANIES_HOUSE_API_URL = 'https://api.company-information.service.gov.uk';
class CompaniesHouseService {
    constructor(config) {
        this.apiKey = config.apiKey;
    }
    /**
     * Search for companies by name or number
     */
    async searchCompanies(query, itemsPerPage = 10) {
        try {
            const url = `${COMPANIES_HOUSE_API_URL}/search/companies?q=${encodeURIComponent(query)}&items_per_page=${itemsPerPage}`;
            const response = await fetch(url, {
                headers: {
                    Authorization: `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
                    'Content-Type': 'application/json',
                },
            });
            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid Companies House API key');
                }
                throw new Error(`Companies House API error: ${response.status} ${response.statusText}`);
            }
            const data = (await response.json());
            return data.items || [];
        }
        catch (error) {
            logger_js_1.default.error('Companies House search error:', error);
            throw error;
        }
    }
    /**
     * Get detailed company information by company number
     */
    async getCompanyDetails(companyNumber) {
        try {
            // Clean company number (remove spaces)
            const cleanNumber = companyNumber.replace(/\s/g, '').toUpperCase();
            const url = `${COMPANIES_HOUSE_API_URL}/company/${cleanNumber}`;
            const response = await fetch(url, {
                headers: {
                    Authorization: `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
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
            return data;
        }
        catch (error) {
            logger_js_1.default.error('Companies House get details error:', error);
            throw error;
        }
    }
    /**
     * Format company data for client creation
     */
    formatForClientCreation(company) {
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
    mapCompanyType(chType) {
        const typeMap = {
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
exports.CompaniesHouseService = CompaniesHouseService;
// Factory function for creating service from environment
function createCompaniesHouseService() {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
        logger_js_1.default.warn('Companies House API key not configured');
        return null;
    }
    return new CompaniesHouseService({ apiKey });
}
exports.default = CompaniesHouseService;
//# sourceMappingURL=companiesHouse.js.map