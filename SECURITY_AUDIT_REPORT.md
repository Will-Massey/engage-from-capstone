# Engage by Capstone - Comprehensive Security Audit Report

**Date:** March 4, 2026  
**Auditor:** Security Analysis Agent  
**Scope:** Backend (Node.js/Express/TypeScript) and Frontend (React/TypeScript)  

---

## Executive Summary

This security audit identified **17 security issues** across the Engage by Capstone application, ranging from Critical to Low severity. The most significant issues include disabled CSP headers, weak JWT secret fallbacks, missing CSRF protection, and potential XSS vulnerabilities from unsanitized HTML content.

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 5 |
| Medium | 6 |
| Low | 3 |

---

## Critical Issues (Immediate Action Required)

### 1. DISABLED CONTENT SECURITY POLICY (CSP)
**File:** `engage/backend/src/index.ts` (Lines 36-38)  
**Severity:** Critical  

```typescript
app.use(helmet({
  contentSecurityPolicy: false,  // DANGEROUS - CSP disabled
}));
```

**Issue:** The Content Security Policy is completely disabled, leaving the application vulnerable to XSS attacks, clickjacking, and data injection attacks.

**Impact:** Attackers can inject and execute malicious scripts, load external resources, and perform clickjacking attacks.

**Recommendation:**
```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Required for some UI frameworks
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.FRONTEND_URL],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // If needed for compatibility
}));
```

---

### 2. WEAK JWT SECRET FALLBACK
**File:** `engage/backend/src/middleware/auth.ts` (Line 6)  
**Severity:** Critical  

```typescript
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';  // DANGEROUS
```

**Issue:** If `JWT_SECRET` environment variable is not set, the application falls back to a predictable, hardcoded secret. This allows attackers to forge JWT tokens and impersonate any user.

**Impact:** Complete authentication bypass, unauthorized access to all user accounts and data.

**Recommendation:**
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
// Ensure minimum secret length
if (JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}
```

---

### 3. UNVALIDATED URL REDIRECT (Open Redirect)
**File:** `engage/backend/src/index.ts` (Lines 162-185)  
**Severity:** Critical  

```typescript
const handleOAuthCallback = (provider: string) => (req: any, res: any) => {
  // ...
  return res.redirect(`${process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk'}/settings?error=${encodeURIComponent(error as string)}`);
  // ...
  res.redirect(`${process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk'}/settings?oauth=success&provider=${provider}&code=${code}&state=${state}`);
};
```

**Issue:** OAuth callbacks construct redirect URLs using potentially user-influenced data without validation. While `FRONTEND_URL` is environment-controlled, the pattern is risky.

**Impact:** Potential open redirect vulnerabilities could be exploited for phishing attacks.

**Recommendation:**
```typescript
const ALLOWED_REDIRECT_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://engagebycapstone.co.uk'
].filter(Boolean);

const handleOAuthCallback = (provider: string) => (req: any, res: any) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://engagebycapstone.co.uk';
  
  // Validate the frontend URL is in allowlist
  if (!ALLOWED_REDIRECT_ORIGINS.includes(frontendUrl)) {
    return res.status(400).json({ error: 'Invalid redirect configuration' });
  }
  
  // Sanitize query parameters before redirect
  const sanitizedError = error ? encodeURIComponent(String(error).slice(0, 100)) : '';
  // ...
};
```

---

## High Severity Issues

### 4. MISSING CSRF PROTECTION
**Files:** All route files  
**Severity:** High  

**Issue:** The application lacks Cross-Site Request Forgery (CSRF) protection for state-changing operations. While the API uses JWT tokens, the public proposal sharing endpoints and OAuth callbacks don't have CSRF tokens.

**Impact:** Attackers can trick users into performing unintended actions (accepting proposals, changing settings).

**Recommendation:**
```typescript
// Install csurf or implement Double Submit Cookie pattern
import csrf from 'csurf';

const csrfProtection = csrf({ cookie: true });

// Apply to state-changing routes
app.post('/api/proposals/:id/accept', authenticate, csrfProtection, ...);
```

For APIs, implement Double Submit Cookie pattern or use SameSite cookies strictly.

---

### 5. UNSANITIZED HTML CONTENT IN PROPOSALS
**File:** `engage/backend/src/routes/proposals.ts` (Lines 254-256)  
**Severity:** High  

```typescript
coverLetter: data.coverLetter,
terms: data.terms,
notes: data.notes,
```

**Issue:** Proposal content fields (coverLetter, terms, notes) are stored and potentially rendered without sanitization, leading to stored XSS vulnerabilities.

**Impact:** Stored XSS attacks against all users viewing proposals.

**Recommendation:**
```typescript
import DOMPurify from 'isomorphic-dompurify';

// Sanitize HTML content
const sanitizeHtml = (html: string | undefined): string => {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
    ALLOWED_ATTR: [],
  });
};

// In route handler
coverLetter: sanitizeHtml(data.coverLetter),
terms: sanitizeHtml(data.terms),
notes: sanitizeHtml(data.notes),
```

---

### 6. INSECURE SMTP TLS CONFIGURATION
**File:** `engage/backend/src/services/emailService.ts` (Lines 115-118)  
**Severity:** High  

```typescript
tls: {
  rejectUnauthorized: false,  // DANGEROUS - Accepts invalid certificates
},
```

**Issue:** SMTP TLS is configured to accept unauthorized/untrusted certificates, making the connection vulnerable to man-in-the-middle attacks.

**Impact:** Email credentials and content can be intercepted by attackers.

**Recommendation:**
```typescript
tls: {
  rejectUnauthorized: true,  // Always verify certificates
  minVersion: 'TLSv1.2',     // Enforce minimum TLS version
},
```

---

### 7. INSUFFICIENT RATE LIMITING ON SENSITIVE ENDPOINTS
**File:** `engage/backend/src/index.ts` (Lines 98-126)  
**Severity:** High  

**Issue:** Rate limiting is applied broadly but may not be strict enough for sensitive operations like user creation, password changes, or tenant creation.

**Impact:** Brute force attacks, resource exhaustion, enumeration attacks.

**Recommendation:**
```typescript
// Stricter limits for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true, // Don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/change-password', strictLimiter);
app.use('/api/auth/users', strictLimiter);
app.use('/api/tenants', strictLimiter);
```

---

### 8. MISSING PASSWORD STRENGTH VALIDATION
**File:** `engage/backend/src/routes/auth.ts` (Line 19)  
**Severity:** High  

```typescript
password: z.string().min(8, 'Password must be at least 8 characters'),
```

**Issue:** Password validation only checks minimum length. No complexity requirements (uppercase, lowercase, numbers, special characters).

**Impact:** Users can create weak passwords vulnerable to brute force attacks.

**Recommendation:**
```typescript
const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');
```

---

## Medium Severity Issues

### 9. HARDCODED DEMO CREDENTIALS IN FRONTEND
**File:** `engage/frontend/src/pages/auth/Login.tsx` (Lines 148-156)  
**Severity:** Medium  

```tsx
<div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-100">
  <p className="text-sm text-primary-800">
    <strong>Demo credentials:</strong>
    <br />
    Email: admin@demo.practice
    <br />
    Password: DemoPass123!
  </p>
</div>
```

**Issue:** Demo credentials are hardcoded in the production frontend code.

**Impact:** If demo accounts exist in production, they can be easily compromised.

**Recommendation:**
```tsx
// Only show in development
{import.meta.env.DEV && (
  <div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-100">
    <p className="text-sm text-primary-800">
      <strong>Demo credentials:</strong>
      <br />
      Email: admin@demo.practice
      <br />
      Password: DemoPass123!
    </p>
  </div>
)}
```

---

### 10. INFORMATION DISCLOSURE IN ERROR MESSAGES
**File:** `engage/backend/src/middleware/errorHandler.ts`  
**Severity:** Medium  

**Issue:** While production hides stack traces, error codes and messages can still reveal system internals.

**Impact:** Information leakage aids attackers in reconnaissance.

**Recommendation:** Map internal errors to generic user-friendly messages in production:
```typescript
const errorMessageMap: Record<string, string> = {
  'P2002': 'A record with this value already exists',
  'P2025': 'Record not found',
  // Don't expose database error codes directly
};
```

---

### 11. CORS ALLOWS WILDCARD IN DEVELOPMENT
**File:** `engage/backend/src/index.ts` (Lines 65-72)  
**Severity:** Medium  

```typescript
if (isDevelopment && (
  origin.startsWith('http://localhost:') || 
  origin.startsWith('http://127.0.0.1:') ||
  /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin) ||
  /^http:\/\/100\.\d+\.\d+\.\d+:\d+$/.test(origin)
)) {
  return callback(null, true);
}
```

**Issue:** Development CORS configuration is too permissive (any localhost port, any 192.168.x.x IP).

**Impact:** If development mode is accidentally enabled in production, or if attackers can make requests from local network, CORS protection is bypassed.

**Recommendation:**
```typescript
const allowedDevOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  // Explicitly list allowed development origins
];
```

---

### 12. WEAK REQUEST ID GENERATION
**File:** `engage/backend/src/index.ts` (Line 141)  
**Severity:** Medium  

```typescript
(req as any).requestId = Math.random().toString(36).substring(2, 15);
```

**Issue:** Request IDs are generated using `Math.random()` which is not cryptographically secure and can have collisions.

**Recommendation:**
```typescript
import { randomUUID } from 'crypto';

(req as any).requestId = randomUUID();
```

---

### 13. SIGNATURE DATA VALIDATION INSUFFICIENT
**File:** `engage/backend/src/services/proposalSharingService.ts` (Lines 182-185)  
**Severity:** Medium  

```typescript
// Validate signature data
if (!data.signatureData || data.signatureData.length < 100) {
  return { success: false, error: 'Invalid signature data' };
}
```

**Issue:** Only checks length, not format. Could accept any base64-like string.

**Recommendation:**
```typescript
// Validate signature is valid base64 image
const validSignaturePattern = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
if (!validSignaturePattern.test(data.signatureData)) {
  return { success: false, error: 'Invalid signature format' };
}
// Also validate size (prevent DoS)
const base64Data = data.signatureData.split(',')[1];
if (Buffer.from(base64Data, 'base64').length > 5 * 1024 * 1024) { // 5MB max
  return { success: false, error: 'Signature image too large' };
}
```

---

### 14. EMAIL INJECTION VULNERABILITY
**File:** `engage/backend/src/routes/proposals.ts` (Lines 478-507)  
**Severity:** Medium  

**Issue:** Email headers are constructed using user-controlled data (`senderName`, `senderPosition`) without sanitization.

**Impact:** Email header injection attacks (CC/BCC injection).

**Recommendation:**
```typescript
// Sanitize email-related fields
const sanitizeEmailField = (field: string): string => {
  // Remove newlines and control characters
  return field.replace(/[\r\n\x00-\x1F\x7F]/g, '');
};

const senderName = sanitizeEmailField(`${req.user!.firstName} ${req.user!.lastName}`);
```

---

## Low Severity Issues

### 15. CLIENT-SIDE TOKEN STORAGE
**File:** `engage/frontend/src/stores/authStore.ts`  
**Severity:** Low  

**Issue:** JWT tokens are stored in localStorage (via zustand persist), making them vulnerable to XSS attacks.

**Impact:** If XSS vulnerability exists, tokens can be stolen.

**Recommendation:** Use httpOnly cookies for token storage (requires backend changes), or implement token refresh mechanism with short-lived access tokens.

---

### 16. MISSING SECURITY HEADERS
**File:** `engage/backend/src/index.ts`  
**Severity:** Low  

**Issue:** Some security headers are not explicitly configured:
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy

**Recommendation:**
```typescript
app.use(helmet({
  contentSecurityPolicy: { /* ... */ },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

---

### 17. VERBOSE LOGGING IN PRODUCTION
**File:** `engage/backend/src/config/database.ts` (Lines 9-11)  
**Severity:** Low  

```typescript
log: process.env.NODE_ENV === 'development' 
  ? ['query', 'error', 'warn'] 
  : ['error'],
```

**Issue:** While queries are not logged in production, consider also excluding sensitive data from error logs.

**Recommendation:** Implement log sanitization to remove PII and credentials from logs.

---

## Positive Security Findings

1. **SQL Injection Prevention:** Using Prisma ORM with parameterized queries throughout.

2. **Input Validation:** Zod schemas are used consistently for request validation.

3. **Authentication:** JWT tokens with proper expiration and refresh token rotation.

4. **Authorization:** Role-based access control (RBAC) implemented with `authorize()` middleware.

5. **Multi-tenancy:** Proper tenant isolation in database queries.

6. **Rate Limiting:** Basic rate limiting implemented for API and auth endpoints.

7. **Error Handling:** Structured error responses with sanitized messages in production.

8. **Bcrypt Password Hashing:** Proper password hashing with salt rounds of 12.

---

## Remediation Priority Matrix

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| P0 | Enable CSP Headers | Low | Critical |
| P0 | Fix JWT Secret Fallback | Low | Critical |
| P0 | Fix SMTP TLS | Low | Critical |
| P1 | Implement CSRF Protection | Medium | High |
| P1 | Sanitize HTML Content | Medium | High |
| P1 | Strengthen Password Policy | Low | High |
| P2 | Implement Strict Rate Limiting | Medium | High |
| P2 | Remove Demo Credentials | Low | Medium |
| P2 | Fix Request ID Generation | Low | Medium |
| P3 | Improve Error Messages | Low | Medium |
| P3 | Harden CORS Configuration | Low | Medium |

---

## Security Best Practices Checklist

- [ ] Enable Content Security Policy headers
- [ ] Enforce strong JWT secret configuration
- [ ] Enable TLS certificate verification
- [ ] Implement CSRF protection for state-changing operations
- [ ] Sanitize all user-generated HTML content
- [ ] Implement strong password policy (12+ chars, complexity requirements)
- [ ] Add strict rate limiting for sensitive endpoints
- [ ] Remove hardcoded credentials from codebase
- [ ] Use cryptographically secure random number generation
- [ ] Implement security headers (HSTS, X-Frame-Options, etc.)
- [ ] Add request size limits for all endpoints
- [ ] Implement proper session management with httpOnly cookies
- [ ] Add audit logging for sensitive operations
- [ ] Implement API versioning for security updates
- [ ] Regular dependency vulnerability scanning

---

## Compliance Considerations

### UK GDPR
- Ensure proposal data retention policies are implemented
- Implement right to erasure (proper data deletion)
- Encrypt sensitive data at rest

### eIDAS (Electronic Signatures)
- Electronic signature implementation appears compliant
- Audit trail is maintained
- IP address and timestamp are captured

### Cyber Essentials
- Boundary firewalls and internet gateways (partial - CSP disabled)
- Secure configuration (needs hardening)
- User access control (implemented)
- Malware protection (not in scope)
- Patch management (ensure dependencies are updated)

---

## Conclusion

The Engage by Capstone application has a solid foundation with Prisma ORM, JWT authentication, and role-based access control. However, **immediate action is required** on the 3 Critical issues, particularly enabling CSP headers and fixing the JWT secret fallback. The High severity issues should be addressed within the next development sprint to significantly improve the security posture.

Regular security audits and penetration testing are recommended as the application grows.

---

**End of Report**
