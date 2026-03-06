# Engage by Capstone - Landing Page Integration

## Overview
Engage will be integrated into the Capstone Software website at `capstonesoftware.co.uk/engage`

## Landing Page Design

### Hero Section
- **Headline**: "Engage - Professional Proposal Generation for UK Accountants"
- **Subheadline**: "Create, send, and track client proposals in minutes. Built for UK accounting practices."
- **CTA Button**: "Start Free Trial" → Links to app login/registration
- **Visual**: App screenshot or animated demo

### Key Features Section
1. **3-Step Proposal Builder**
   - Select Client
   - Build Services
   - Review & Send

2. **Visual Service Catalog**
   - Click-to-add services
   - Inline pricing adjustments
   - Per-line VAT control

3. **Professional PDF Output**
   - Custom cover letters
   - Branded proposals
   - Electronic signatures

4. **Real-time Tracking**
   - View notifications
   - Signature status
   - Acceptance analytics

### Integration Points

#### 1. Navigation Menu
Add to main website navigation:
```
Products > Engage
```

#### 2. Footer Links
```
Products:
- AccountFlow
- Engage (NEW)
- Capstone Cloud
```

#### 3. Railway Deployment
```
Domain: engage.capstonesoftware.co.uk
Platform: Railway
SSL: Automatic (Let's Encrypt)
```

### Technical Integration

#### DNS Configuration
```
CNAME: engage.capstonesoftware.co.uk
Points to: railway.app
```

#### Environment Variables (Railway)
```env
# Database
DATABASE_URL=postgresql://...

# Authentication
JWT_SECRET=...

# Email
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...

# Frontend URL
FRONTEND_URL=https://engage.capstonesoftware.co.uk

# Stripe (for billing)
STRIPE_PUBLIC_KEY=...
STRIPE_SECRET_KEY=...
```

### Landing Page Files
- `/landing/index.html` - Main landing page
- `/landing/styles.css` - Brand-matched styles
- `/landing/assets/` - Images and logos

### Brand Colors (Match main site)
- Primary: #0ea5e9 (Sky blue)
- Secondary: #1e3a8a (Dark blue)
- Accent: #f59e0b (Amber)
- Text: #1f2937 (Gray 800)

### CTAs
1. **Primary**: "Start Free Trial" → `/register`
2. **Secondary**: "View Demo" → Demo video or interactive tour
3. **Tertiary**: "Sign In" → `/login`
