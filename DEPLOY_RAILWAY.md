# 🚀 Deploy to Railway

## Prerequisites

1. Railway CLI installed: `npm install -g @railway/cli`
2. Railway account: https://railway.app
3. Git repository pushed to GitHub

## Step 1: Create Railway Project

```bash
# Login to Railway
railway login

# Create new project
railway init

# Or link to existing project
railway link
```

## Step 2: Add PostgreSQL Database

```bash
# Add PostgreSQL plugin
railway add --database postgresql

# Or use Railway dashboard:
# 1. Go to project dashboard
# 2. Click "New" → "Database" → "Add PostgreSQL"
```

## Step 3: Configure Environment Variables

Add these variables in Railway Dashboard → Variables:

```env
# Required
NODE_ENV=production
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Frontend URL (update after frontend deploy)
FRONTEND_URL=https://your-frontend-url.vercel.app

# Email (SMTP)
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Optional - OAuth Email
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

## Step 4: Deploy Backend

```bash
# Deploy from project root (where railway.toml is)
railway up

# Or deploy via GitHub integration:
# 1. Connect GitHub repo in Railway dashboard
# 2. Railway auto-deploys on push to main branch
```

## Step 5: Run Migrations

```bash
# Open Railway shell
railway shell

# Run migrations
npx prisma migrate deploy

# Or seed database (optional)
npx prisma db seed
```

## Step 6: Verify Deployment

```bash
# Check logs
railway logs

# Test health endpoint
curl https://your-app.railway.app/api/health
```

## Step 7: Deploy Frontend (Vercel)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy frontend
cd frontend
vercel --prod

# Set environment variables in Vercel:
VITE_API_URL=https://your-backend.railway.app
```

## Troubleshooting

### Database Connection Issues
```bash
# Check database URL
railway variables

# Test connection
railway connect postgres
```

### Build Failures
```bash
# Check build logs
railway logs --build

# Verify TypeScript compilation
cd backend
npm run build
```

### Migration Failures
```bash
# Reset database (WARNING: deletes all data)
railway run npx prisma migrate reset

# Or create manual migration
railway run npx prisma migrate dev --name fix_migration
```

## Production Checklist

- [ ] JWT_SECRET is strong (min 32 chars)
- [ ] Database migrations applied
- [ ] Email configuration working
- [ ] Health check endpoint responding
- [ ] CORS configured for production domain
- [ ] Frontend deployed and connected
- [ ] SSL/HTTPS enabled
- [ ] Rate limiting configured
- [ ] Error tracking set up (Sentry)
- [ ] Backups scheduled

## Monitoring

```bash
# View logs in real-time
railway logs --follow

# View metrics
railway status
```

## Custom Domain

1. Go to Railway Dashboard → Settings → Domains
2. Add your custom domain
3. Update DNS records
4. Update FRONTEND_URL and CORS settings

## Support

- Railway Docs: https://docs.railway.app
- Prisma Docs: https://www.prisma.io/docs
- Railway Discord: https://discord.gg/railway
