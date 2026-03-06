# Railway Deployment Guide for Engage

## Domain Setup

### 1. DNS Configuration
Add to your DNS provider (for capstonesoftware.co.uk):

```
Type:    CNAME
Name:    engage
Value:   your-railway-app.up.railway.app
TTL:     3600
```

### 2. Railway Configuration

#### railway.json
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "npm run start:prod",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

#### Environment Variables
```env
# Required
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=your-64-char-secret-here

# Frontend URL
FRONTEND_URL=https://engage.capstonesoftware.co.uk

# Email Configuration
SMTP_HOST=mail.123-reg.co.uk
SMTP_PORT=587
SMTP_USER=your-email@capstonesoftware.co.uk
SMTP_PASS=your-email-password
SUPPORT_EMAIL=engage@capstonesoftware.co.uk

# Stripe (for billing)
STRIPE_PUBLIC_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Microsoft OAuth (optional)
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...

# Google OAuth (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 3. Custom Domain Setup in Railway

1. Go to Railway Dashboard → Your Project → Settings
2. Click "Domains"
3. Click "Custom Domain"
4. Enter: `engage.capstonesoftware.co.uk`
5. Railway will provide a CNAME target
6. Update your DNS with the provided CNAME
7. Wait for SSL certificate to be issued (automatic)

### 4. Landing Page Deployment

The landing page should be served from the main website:

```
Main Site: https://capstonesoftware.co.uk/engage/
App:       https://engage.capstonesoftware.co.uk/
```

#### Option A: Static Hosting on Main Site
Upload the `/landing` folder contents to:
```
/public_html/engage/
```

#### Option B: Subdomain Redirect
Set up redirect from `/engage` to landing page on Railway

### 5. Integration Points

#### Main Website Navigation
Update your main website header to include:
```html
<nav>
  <a href="/">Home</a>
  <a href="/accountflow">AccountFlow</a>
  <a href="/engage" class="highlight">Engage</a>
  <a href="/contact">Contact</a>
</nav>
```

#### Footer Links
```html
<div class="footer-products">
  <h4>Products</h4>
  <a href="/accountflow">AccountFlow</a>
  <a href="/engage">Engage <span class="badge-new">New</span></a>
</div>
```

### 6. SSL Certificate
Railway automatically provisions SSL certificates for custom domains.

Verify SSL:
```bash
curl -I https://engage.capstonesoftware.co.uk
```

Should return:
```
HTTP/2 200
server: railway
```

### 7. Testing Checklist

- [ ] DNS propagation complete (check with `nslookup engage.capstonesoftware.co.uk`)
- [ ] SSL certificate issued
- [ ] Landing page loads at `/engage`
- [ ] App loads at `engage.capstonesoftware.co.uk`
- [ ] Login works
- [ ] Registration works
- [ ] Email sending works
- [ ] Proposals can be created
- [ ] PDF generation works

### 8. Monitoring

Set up monitoring in Railway:
1. Enable Railway Observability
2. Set up alerts for:
   - High CPU usage (>80%)
   - High memory usage (>80%)
   - Database connection errors
   - 5xx errors

### 9. Backup Strategy

Railway PostgreSQL has automatic backups:
- Daily backups retained for 7 days
- Weekly backups retained for 4 weeks
- Monthly backups retained for 12 months

### 10. Support & Escalation

For issues:
1. Check Railway status: https://railway.app/status
2. Check application logs in Railway Dashboard
3. Contact: engage@capstonesoftware.co.uk
