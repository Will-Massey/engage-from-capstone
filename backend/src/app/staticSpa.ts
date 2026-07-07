import express from 'express';
import path from 'path';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler.js';
import { checkDatabaseHealth } from '../config/database.js';
import healthRouter from '../routes/health.js';

// Uploads are served via authenticated /api/uploads routes only (no public static dir)

// Health check routes (must be BEFORE static files and SPA handler)
export function mountHealthStaticAndErrors(app: express.Express): void {
  app.use('/ping', async (_req, res) => {
    const dbHealth = await checkDatabaseHealth();
    if (dbHealth.healthy) {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({
        status: 'error',
        message: 'Database unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  });
  app.use('/health', healthRouter);

  // Serve static frontend files
  const publicPath = path.join(process.cwd(), 'public');

  // Hashed build assets (assets/[name]-[hash].*) are content-addressed — cache forever
  app.use(
    '/assets',
    express.static(path.join(publicPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
      index: false,
    })
  );

  // Shell + unhashed files — short TTL so deploys propagate quickly (worker uses 60s too)
  app.use(
    express.static(publicPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'public, max-age=60');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  // Serve index.html for all non-API routes (SPA support)
  app.get('*', (req, res, next) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.sendFile(path.join(publicPath, 'index.html'), (err) => {
      if (err) {
        // If index.html doesn't exist, return a message
        res.status(404).json({
          success: false,
          error: {
            code: 'FRONTEND_NOT_BUILT',
            message:
              'Frontend build not found. The application backend is running but the frontend has not been deployed.',
            publicPath: publicPath,
          },
        });
      }
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);
}
