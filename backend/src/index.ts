import dotenv from 'dotenv';
// Load environment variables FIRST, before any other imports
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';

// Import routes
import authRoutes from './routes/auth.js';
import companiesHouseRoutes from './routes/companiesHouse.js';
import proposalRoutes from './routes/proposals.js';
import proposalShareRoutes from './routes/proposals-share.js';
import clientRoutes from './routes/clients.js';
import serviceRoutes from './routes/services.js';
import enhancedServiceRoutes from './routes/services-new.js';
import tenantRoutes from './routes/tenants.js';
import emailRoutes from './routes/email.js';
import paymentRoutes from './routes/payments.js';
import { asyncHandler, ApiError } from './middleware/errorHandler.js';
import { EmailService } from './services/emailService.js';

// Import middleware
import { extractTenant } from './middleware/tenant.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import logger from './config/logger.js';
import { checkDatabaseHealth } from './config/database.js';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware - CSP configured for production
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || "http://localhost:5173"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  // HSTS - HTTP Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },
  // Additional security headers
  hidePoweredBy: true,
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
}));

// CORS configuration - allow multiple origins
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://engage.capstonesoftware.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://192.168.1.86:5173',
  'http://100.83.223.249:5173',
  'https://frontend-fawn-eta-13.vercel.app',
  'https://frontend-7bwwe5u7u-will-masseys-projects-b935486d.vercel.app',
  'https://frontend-o4blqd5z2-will-masseys-projects-b935486d.vercel.app',
  'https://frontend-go1ntbkne-will-masseys-projects-b935486d.vercel.app'
].filter(Boolean);

// Regex to match any Vercel preview URL from this project
const vercelProjectPattern = /^https:\/\/frontend-[a-z0-9]+-will-masseys-projects-b935486d\.vercel\.app$/;

// Regex to match any Render.com subdomain
const renderPattern = /^https:\/\/.*\.onrender\.com$/;

// In development, allow all localhost origins
const isDevelopment = process.env.NODE_ENV !== 'production';

const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In development, allow all localhost origins
    if (isDevelopment && (
      origin.startsWith('http://localhost:') || 
      origin.startsWith('http://127.0.0.1:') ||
      /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin) ||
      /^http:\/\/100\.\d+\.\d+\.\d+:\d+$/.test(origin)
    )) {
      return callback(null, true);
    }
    
    // Check exact matches
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Check Vercel preview URL pattern
    if (vercelProjectPattern.test(origin)) {
      return callback(null, true);
    }
    
    // Check Render.com URL pattern
    if (renderPattern.test(origin)) {
      return callback(null, true);
    }
    
    console.warn(`CORS blocked for origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id', 'X-Request-Id', 'X-CSRF-Token'],
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
  },
});

app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT',
      message: 'Too many authentication attempts, please try again later',
    },
  },
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Stricter rate limiting for public proposal endpoints (viewing/signing)
const publicProposalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/proposals/view', publicProposalLimiter);

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// Cookie parsing (required for CSRF and auth cookies)
app.use(cookieParser());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import CSRF middleware
import { setCsrfCookie, csrfProtection } from './middleware/auth.js';

// CSRF protection - set cookie on all requests
app.use(setCsrfCookie);

// Apply CSRF protection to API routes (except auth login/register)
app.use('/api', csrfProtection);

// Request ID middleware
app.use((req, res, next) => {
  (req as any).requestId = Math.random().toString(36).substring(2, 15);
  next();
});

// Simple ping endpoint for Railway healthcheck (no DB required)
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  
  res.json({
    success: true,
    data: {
      status: dbHealth.healthy ? 'healthy' : 'unhealthy',
      database: dbHealth.healthy ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    },
  });
});

// API health check for Railway
app.get('/api/health', async (req, res) => {
  const dbHealth = await checkDatabaseHealth();
  
  if (!dbHealth.healthy) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'UNHEALTHY',
        message: 'Database connection failed',
      },
    });
  }
  
  res.json({
    success: true,
    data: {
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
    },
  });
});

// OAuth callback routes - specific paths for each provider
const handleOAuthCallback = (provider: string) => (req: any, res: any) => {
  logger.info(`OAuth callback hit: provider=${provider}, query=${JSON.stringify(req.query)}`);
  
  const { code, error, state } = req.query;
  
  if (error) {
    logger.warn(`OAuth error: ${error}`);
    return res.redirect(`${process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk'}/settings?error=${encodeURIComponent(error as string)}`);
  }
  
  if (!code) {
    logger.warn('No code received');
    return res.redirect(`${process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk'}/settings?error=no_code_received`);
  }
  
  logger.info(`OAuth success for ${provider}, redirecting to frontend`);
  // Redirect to frontend with code
  res.redirect(`${process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk'}/settings?oauth=success&provider=${provider}&code=${code}&state=${state}`);
};

// Specific OAuth callback routes
app.get('/api/oauth/callback/outlook', handleOAuthCallback('outlook'));
app.get('/api/oauth/callback/microsoft365', handleOAuthCallback('microsoft365'));
app.get('/api/oauth/callback/gmail', handleOAuthCallback('gmail'));

// API routes
app.use('/api/auth', extractTenant, authRoutes);
app.use('/api/proposals', extractTenant, proposalRoutes);
app.use('/api/proposals', proposalShareRoutes);
app.use('/api/clients', extractTenant, clientRoutes);
app.use('/api/services', extractTenant, serviceRoutes);
app.use('/api/services/v2', extractTenant, enhancedServiceRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/email', extractTenant, emailRoutes);
app.use('/api/payments', extractTenant, paymentRoutes);
app.use('/api/companies-house', companiesHouseRoutes);

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'operational',
      features: {
        multiTenancy: true,
        mtddigital: true,
        pdfGeneration: true,
        pricingEngine: true,
      },
      timestamp: new Date().toISOString(),
    },
  });
});

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static frontend files
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res, next) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'), (err) => {
    if (err) {
      // If index.html doesn't exist, return a message
      res.status(404).json({
        success: false,
        error: {
          code: 'FRONTEND_NOT_BUILT',
          message: 'Frontend build not found. The application backend is running but the frontend has not been deployed.',
          publicPath: publicPath
        }
      });
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Engage by Capstone API running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 API URL: http://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;
