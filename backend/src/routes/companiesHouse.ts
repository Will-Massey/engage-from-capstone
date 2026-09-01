/**
 * Companies House API Routes
 * Provides company search and lookup endpoints
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import {
  companiesHouseSearchQuerySchema,
  createCompaniesHouseService,
  normalizeCompanyNumber,
} from '../services/companiesHouse.js';
import logger from '../config/logger.js';

const router = Router();

/**
 * GET /api/companies-house/search
 * Search for companies by name or number
 */
router.get(
  '/search',
  authenticate,
  asyncHandler(async (req, res) => {
    const { q, limit } = companiesHouseSearchQuerySchema.parse(req.query);

    logger.info(`Companies House search for: ${q}, tenant: ${req.tenantId}`);

    // Check if service is configured
    const chService = createCompaniesHouseService();
    if (!chService) {
      logger.error('Companies House API key not configured');
      throw new ApiError(
        'NOT_CONFIGURED',
        'Companies House API not configured. Please set COMPANIES_HOUSE_API_KEY environment variable.',
        503
      );
    }

    try {
      const results = await chService.searchCompanies(q, limit);

      res.json({
        success: true,
        data: results
          .map((company) => ({
            companyNumber: company.company_number,
            companyName: company.title || company.company_name || company.company_number,
            companyStatus: company.company_status,
            companyType: company.company_type,
            dateOfCreation: company.date_of_creation,
            address: company.registered_office_address || company.address,
          }))
          .filter((company) => company.companyNumber),
        query: q,
      });
    } catch (error: any) {
      logger.error('Companies House search error:', error);
      throw new ApiError('SEARCH_FAILED', error.message || 'Failed to search Companies House', 500);
    }
  })
);

/**
 * GET /api/companies-house/company/:number
 * Get detailed company information
 */
router.get(
  '/company/:number',
  authenticate,
  asyncHandler(async (req, res) => {
    const number = normalizeCompanyNumber(String(req.params.number || ''));
    if (!number) {
      throw new ApiError('VALIDATION_ERROR', 'Invalid company number format', 400);
    }

    // Check if service is configured
    const chService = createCompaniesHouseService();
    if (!chService) {
      throw new ApiError('NOT_CONFIGURED', 'Companies House API not configured', 503);
    }

    try {
      const company = await chService.getCompanyDetails(number);
      const formatted = chService.formatForClientCreation(company);

      res.json({
        success: true,
        data: {
          raw: company,
          formatted: formatted,
        },
      });
    } catch (error: any) {
      logger.error('Companies House get details error:', error);
      if (error.message === 'Company not found') {
        throw new ApiError('COMPANY_NOT_FOUND', 'Company not found', 404);
      }
      throw new ApiError('FETCH_FAILED', error.message || 'Failed to fetch company details', 500);
    }
  })
);

/**
 * GET /api/companies-house/status
 * Check if Companies House API is configured and working
 */
router.get(
  '/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const chService = createCompaniesHouseService();

    if (!chService) {
      res.json({
        success: true,
        data: {
          configured: false,
          connected: false,
          message: 'Companies House API key not configured',
        },
      });
      return;
    }

    // Do not probe /search here — every Create Client / Clara card used to burn
    // a live CH request and a 429 or blip marked the whole lookup as "off".
    res.json({
      success: true,
      data: {
        configured: true,
        connected: true,
        message: 'Companies House API key is configured',
      },
    });
  })
);

export default router;
