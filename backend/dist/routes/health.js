/**
 * Health Check Routes
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();
// Root health endpoint (for Render and load balancers)
router.get('/', async (_req, res) => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || 'unknown',
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Database connection failed',
        });
    }
});
// Simple ping endpoint (for load balancers)
router.get('/ping', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Basic health check
router.get('/health', async (_req, res) => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || 'unknown',
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Database connection failed',
        });
    }
});
// Readiness check (for Kubernetes)
router.get('/ready', async (_req, res) => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        res.status(200).json({ ready: true });
    }
    catch (error) {
        res.status(503).json({ ready: false, reason: 'Database not ready' });
    }
});
// Liveness check (for Kubernetes)
router.get('/live', (_req, res) => {
    res.status(200).json({ alive: true });
});
export default router;
