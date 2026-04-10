import { Router } from 'express';
import { prisma } from '../config/database.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

/**
 * GET /api/diagnostics/health
 * Public health check endpoint
 */
router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const checks: any = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {},
    };
    
    try {
      // Database check
      await prisma.$queryRaw`SELECT 1`;
      checks.checks.database = { status: 'ok', message: 'Connected' };
    } catch (error: any) {
      checks.status = 'unhealthy';
      checks.checks.database = { 
        status: 'error', 
        message: error.message 
      };
    }
    
    // Check if required fields exist
    try {
      const test = await prisma.proposalService.findFirst({
        select: { displayPrice: true },
      });
      checks.checks.migration = { 
        status: 'ok', 
        message: 'v2 pricing fields exist' 
      };
    } catch (error: any) {
      checks.status = 'degraded';
      checks.checks.migration = { 
        status: 'error', 
        message: 'Migration needed: ' + error.message 
      };
    }
    
    const statusCode = checks.status === 'healthy' ? 200 : 
                       checks.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(checks);
  })
);

/**
 * GET /api/diagnostics/db-status
 * Detailed database status (admin only)
 */
router.get(
  '/db-status',
  asyncHandler(async (req, res) => {
    // Simple auth check - require API key or admin
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.DIAGNOSTICS_API_KEY) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
      });
    }
    
    const status: any = {
      timestamp: new Date().toISOString(),
      database: {},
      tables: {},
    };
    
    try {
      // Connection test
      const dbResult = await prisma.$queryRaw`SELECT NOW()`;
      status.database.connected = true;
      status.database.serverTime = dbResult[0].now;
      
      // Table counts
      status.tables.proposals = await prisma.proposal.count();
      status.tables.clients = await prisma.client.count();
      status.tables.services = await prisma.serviceTemplate.count();
      status.tables.users = await prisma.user.count();
      
      // Check columns in ProposalService
      try {
        const columns = await prisma.$queryRaw`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ProposalService'
          ORDER BY column_name
        `;
        status.tables.proposalServiceColumns = (columns as any[]).map(c => c.column_name);
        
        // Check for v2 fields
        const hasV2Fields = status.tables.proposalServiceColumns.includes('displayPrice');
        status.migrationStatus = hasV2Fields ? 'v2_complete' : 'v1_legacy';
        
      } catch (e: any) {
        status.tables.proposalServiceColumns = ['Error: ' + e.message];
      }
      
      res.json({
        success: true,
        data: status,
      });
      
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: {
          code: 'DB_ERROR',
          message: error.message,
        },
      });
    }
  })
);

export default router;
