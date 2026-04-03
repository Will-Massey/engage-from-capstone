"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables FIRST, before any other imports
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
// Import routes
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const companiesHouse_js_1 = __importDefault(require("./routes/companiesHouse.js"));
const proposals_js_1 = __importDefault(require("./routes/proposals.js"));
const proposals_share_js_1 = __importDefault(require("./routes/proposals-share.js"));
const clients_js_1 = __importDefault(require("./routes/clients.js"));
const services_js_1 = __importDefault(require("./routes/services.js"));
const services_new_js_1 = __importDefault(require("./routes/services-new.js"));
const tenants_js_1 = __importDefault(require("./routes/tenants.js"));
const email_js_1 = __importDefault(require("./routes/email.js"));
const payments_js_1 = __importDefault(require("./routes/payments.js"));
// Import middleware
// Use simple tenant extraction for Render deployment
const tenant_simple_js_1 = require("./middleware/tenant-simple.js");
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const logger_js_1 = __importStar(require("./utils/logger.js"));
const cache_js_1 = require("./utils/cache.js");
const health_js_1 = __importDefault(require("./routes/health.js"));
// Initialize Express app
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Security middleware - CSP configured for production
app.use((0, helmet_1.default)({
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
    'https://engage-frontend-0g6u.onrender.com',
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
// For Render deployment - temporarily allow all Render origins
const RENDER_DEPLOYMENT = true;
// In development, allow all localhost origins
const isDevelopment = process.env.NODE_ENV !== 'production';
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        // For Render deployment - allow all onrender.com origins
        if (RENDER_DEPLOYMENT && origin.includes('onrender.com')) {
            return callback(null, true);
        }
        // In development, allow all localhost origins
        if (isDevelopment && (origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:') ||
            /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin) ||
            /^http:\/\/100\.\d+\.\d+\.\d+:\d+$/.test(origin))) {
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
app.use((0, cors_1.default)(corsOptions));
// Handle preflight requests explicitly
app.options('*', (0, cors_1.default)(corsOptions));
// Stricter rate limiting for auth endpoints
const authLimiter = (0, express_rate_limit_1.default)({
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
const publicProposalLimiter = (0, express_rate_limit_1.default)({
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
app.use((0, morgan_1.default)('combined', {
    stream: {
        write: (message) => logger_js_1.default.info(message.trim()),
    },
}));
// Cookie parsing (required for CSRF and auth cookies)
app.use((0, cookie_parser_1.default)());
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Mount auth routes BEFORE CSRF protection
app.use('/api/auth', tenant_simple_js_1.extractTenant, auth_js_1.default);
// Import CSRF middleware
const auth_js_2 = require("./middleware/auth.js");
// CSRF protection - set cookie on all requests
app.use(auth_js_2.setCsrfCookie);
// Apply CSRF protection to all API routes
app.use('/api', auth_js_2.csrfProtection);
// Request ID middleware - use crypto for better randomness
const crypto_1 = require("crypto");
app.use((req, res, next) => {
    req.requestId = (0, crypto_1.randomUUID)();
    next();
});
// Request logging
app.use(logger_js_1.requestLogger);
// Initialize cache on startup (non-blocking)
cache_js_1.cache.connect().catch(err => {
    logger_js_1.default.error('Failed to connect to Redis:', err);
});
// Rate limiting - skip for health checks
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    skip: (req) => req.path === '/api/health', // Skip health checks
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
        },
    },
});
app.use('/api/', limiter);
// OAuth callback routes - specific paths for each provider
const handleOAuthCallback = (provider) => (req, res) => {
    logger_js_1.default.info(`OAuth callback hit: provider=${provider}, query=${JSON.stringify(req.query)}`);
    const { code, error, state } = req.query;
    if (error) {
        logger_js_1.default.warn(`OAuth error: ${error}`);
        return res.redirect(`${process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk'}/settings?error=${encodeURIComponent(error)}`);
    }
    if (!code) {
        logger_js_1.default.warn('No code received');
        return res.redirect(`${process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk'}/settings?error=no_code_received`);
    }
    logger_js_1.default.info(`OAuth success for ${provider}, redirecting to frontend`);
    // Redirect to frontend with code
    res.redirect(`${process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk'}/settings?oauth=success&provider=${provider}&code=${code}&state=${state}`);
};
// Specific OAuth callback routes
app.get('/api/oauth/callback/outlook', handleOAuthCallback('outlook'));
app.get('/api/oauth/callback/microsoft365', handleOAuthCallback('microsoft365'));
app.get('/api/oauth/callback/gmail', handleOAuthCallback('gmail'));
// API routes (auth already mounted above)
app.use('/api/proposals', tenant_simple_js_1.extractTenant, proposals_js_1.default);
app.use('/api/proposals', proposals_share_js_1.default);
app.use('/api/clients', tenant_simple_js_1.extractTenant, clients_js_1.default);
app.use('/api/services', tenant_simple_js_1.extractTenant, services_js_1.default);
app.use('/api/services/v2', tenant_simple_js_1.extractTenant, services_new_js_1.default);
app.use('/api/tenants', tenants_js_1.default);
app.use('/api/email', tenant_simple_js_1.extractTenant, email_js_1.default);
app.use('/api/payments', tenant_simple_js_1.extractTenant, payments_js_1.default);
app.use('/api/companies-house', companiesHouse_js_1.default);
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
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Health check routes (must be BEFORE static files and SPA handler)
app.use('/ping', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use('/health', health_js_1.default);
// Serve static frontend files
const publicPath = path_1.default.join(process.cwd(), 'public');
app.use(express_1.default.static(publicPath));
// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res, next) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        return next();
    }
    res.sendFile(path_1.default.join(publicPath, 'index.html'), (err) => {
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
app.use(errorHandler_js_1.notFoundHandler);
// Error handler
app.use(errorHandler_js_1.errorHandler);
// Start server
app.listen(PORT, () => {
    logger_js_1.default.info(`🚀 Engage by Capstone API running on port ${PORT}`);
    logger_js_1.default.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger_js_1.default.info(`🔗 API URL: http://localhost:${PORT}`);
});
// Handle graceful shutdown
process.on('SIGTERM', async () => {
    logger_js_1.default.info('SIGTERM received, shutting down gracefully');
    await cache_js_1.cache.disconnect();
    process.exit(0);
});
process.on('SIGINT', async () => {
    logger_js_1.default.info('SIGINT received, shutting down gracefully');
    await cache_js_1.cache.disconnect();
    process.exit(0);
});
exports.default = app;
//# sourceMappingURL=index.js.map