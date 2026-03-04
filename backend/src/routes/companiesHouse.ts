/**
 * Companies House API Routes
 * Provides company search and lookup endpoints
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { createCompaniesHouseService } from '../services/companiesHouse.js';
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
    const schema = z.object({
      q: z.string().min(1).max(100),
      limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
    });

    const { q, limit } = schema.parse(req.query);

    // Check if service is configured
    const chService = createCompaniesHouseService();
    if (!chService) {
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
        data: results.map(company => ({
          companyNumber: company.company_number,
          companyName: company.company_name,
          companyStatus: company.company_status,
          companyType: company.company_type,
          dateOfCreation: company.date_of_creation,
          address: company.registered_office_address,
        })),
        query: q,
      });
    } catch (error: any) {
      logger.error('Companies House search error:', error);
      throw new ApiError(
        'SEARCH_FAILED',
        error.message || 'Failed to search Companies House',
        500
      );
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
    const schema = z.object({
      number: z.string().regex(/^[A-Za-z0-9]{6,8}$/, 'Invalid company number format'),
    });

    const { number } = schema.parse(req.params);

    // Check if service is configured
    const chService = createCompaniesHouseService();
    if (!chService) {
      throw new ApiError(
        'NOT_CONFIGURED',
        'Companies House API not configured',
        503
      );
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
      throw new ApiError(
        'FETCH_FAILED',
        error.message || 'Failed to fetch company details',
        500
      );
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
          message: 'Companies House API key not configured',
        },
      });
      return;
    }

    // Test with a well-known company (e.g., "TEST COMPANY")
    try {
      await chService.searchCompanies('TEST', 1);
      res.json({
        success: true,
        data: {
          configured: true,
          connected: true,
          message: 'Companies House API is connected and working',
        },
      });
    } catch (error: any) {
      res.json({
        success: true,
        data: {
          configured: true,
          connected: false,
          message: error.message || 'Failed to connect to Companies House API',
        },
      });
    }
  })
);

export default router;
