# Deploy Engage by Capstone to Neon + Railway

This guide walks you through deploying the Engage by Capstone application using **Neon** for PostgreSQL database and **Railway** for application hosting.

---

## Prerequisites

- [Neon](https://neon.tech) account
- [Railway](https://railway.app) account (GitHub login recommended)
- Git repository with your code

---

## Step 1: Set Up Neon PostgreSQL Database

### 1.1 Create Neon Project

1. Go to [Neon Console](https://console.neon.tech)
2. Click **"New Project"**
3. Name: `engage-production` (or your preferred name)
4. Region: Choose closest to your users (e.g., `Europe (Frankfurt)` for UK)
5. Click **"Create Project"**

### 1.2 Get Database Connection String

1. In your Neon project dashboard, click **"Connection Details"**
2. Copy the **"Connection string"** - it looks like:
   ```
   postgresql://username:password@host.neon.tech/database?sslmode=require
   ```
3. Save this for later - you'll need it for Railway

### 1.3 Create Database Schema

You have two options:

**Option A: Run migrations locally against Neon**
```bash
# Set the DATABASE_URL to your Neon database
$env:DATABASE_URL="postgresql://username:password@host.neon.tech/database?sslmode=require"

# Run migrations
cd backend
npx prisma migrate deploy
```

**Option B: Railway will run migrations automatically** (configured in deployment)

---

## Step 2: Deploy to Railway

### 2.1 Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository

### 2.2 Configure Environment Variables

In your Railway project dashboard:

1. Go to **"Variables"** tab
2. Add the following required variables:

#### Required Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `DATABASE_URL` | Your Neon connection string | PostgreSQL database |
| `JWT_SECRET` | Generate a strong secret | For token signing |
| `NODE_ENV` | `production` | Environment mode |
| `EMAIL_PROVIDER` | `smtp` | Email service type |
| `SMTP_HOST` | Your SMTP host | e.g., `smtp.gmail.com` |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | Your email | Sender email address |
| `SMTP_PASS` | Your email password or app password | SMTP password |
| `EMAIL_FROM_NAME` | `Your Practice Name` | Display name |

#### Generate JWT Secret

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2.3 Deploy

1. Railway will automatically detect the `Dockerfile` and build your app
2. The deployment will:
   - Build frontend (React)
   - Build backend (Node.js/Express)
   - Combine into single container
   - Run database migrations
   - Start the application

3. Monitor the deployment logs in Railway dashboard

---

## Step 3: Verify Deployment

### 3.1 Check Health Endpoint

Once deployed, verify the API is running:
```bash
curl https://your-app-name.railway.app/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "...",
    "version": "1.0.0",
    "environment": "production"
  }
}
```

### 3.2 Access Application

1. Railway provides a default URL: `https://your-project-name.railway.app`
2. The frontend is served at the root URL
3. API endpoints are at `/api/...`

### 3.3 Create Initial Admin User

Run this once to create your first admin user:
```bash
# Connect to Railway shell
railway connect

# Or use Railway CLI
railway run node backend/dist/scripts/createAdmin.js
```

---

## Step 4: Configure Custom Domain (Optional)

### 4.1 Add Domain in Railway

1. In Railway dashboard, go to **"Settings"** → **"Domains"**
2. Click **"Generate Domain"** for a Railway subdomain, or
3. Click **"Custom Domain"** to use your own domain

### 4.2 Update Environment Variables

If using custom domain:
1. Update `API_URL` and `FRONTEND_URL` to your custom domain
2. Update `PUBLIC_PROPOSAL_URL` for proposal sharing links

---

## Step 5: Database Management

### 5.1 View Database in Neon

1. Go to [Neon Console](https://console.neon.tech)
2. Your database is accessible with:
   - SQL Editor (built-in)
   - Connection from any PostgreSQL client

### 5.2 Run Manual Migrations

If needed:
```bash
# Set Neon connection string
$env:DATABASE_URL="postgresql://..."

# Deploy migrations
cd backend
npx prisma migrate deploy

# Or generate new migration after schema changes
npx prisma migrate dev --name migration_name
```

### 5.3 Database Backups

Neon automatically provides:
- Point-in-time recovery (up to 7 days on Free tier)
- Automated backups
- Branching for testing

---

## Environment Variables Reference

### Database
```
DATABASE_URL=postgresql://username:password@host.neon.tech/database?sslmode=require
```

### Security
```
JWT_SECRET=your-super-secret-jwt-key-min-32-characters
```

### Email (SMTP Example)
```
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM_NAME=Your Practice Name
EMAIL_FROM_ADDRESS=your-email@gmail.com
```

### Application
```
NODE_ENV=production
PORT=3001
API_URL=https://your-app.railway.app
FRONTEND_URL=https://your-app.railway.app
PUBLIC_PROPOSAL_URL=https://your-app.railway.app
```

---

## Troubleshooting

### Issue: "Cannot connect to database"

1. Verify `DATABASE_URL` is correct
2. Check Neon project is active (not suspended)
3. Ensure `sslmode=require` is in the connection string
4. Verify database user has proper permissions

### Issue: "Migration failed"

1. Check Railway logs for specific error
2. Connect to Neon and check schema:
   ```sql
   \dt  -- List tables
   ```
3. Run migrations manually:
   ```bash
   npx prisma migrate deploy
   ```

### Issue: "Email not sending"

1. Verify email credentials in environment variables
2. For Gmail: Use App Password, not regular password
3. Check SMTP settings match your provider
4. Check Railway logs for email errors

### Issue: "Frontend not loading"

1. Verify build completed successfully in Railway logs
2. Check that `Dockerfile` is properly copying frontend build
3. Verify `PUBLIC_PROPOSAL_URL` is set correctly

---

## Updating the Application

### Automatic Deployments

Railway automatically deploys when you push to GitHub:
1. Push changes to your repository
2. Railway detects the push
3. Builds and deploys new version
4. Zero-downtime deployment

### Manual Deploy

```bash
# Using Railway CLI
railway login
railway link
railway up
```

---

## Monitoring & Logs

### Railway Dashboard
- **Deployments**: View deployment history
- **Logs**: Real-time application logs
- **Metrics**: CPU, memory usage
- **Variables**: Environment configuration

### Neon Dashboard
- **Query Statistics**: Database performance
- **Storage**: Disk usage
- **Branches**: Database branching for testing

---

## Cost Optimization

### Neon Free Tier
- 3 databases
- 3 GiB storage
- 190 compute hours/month
- Automatic sleep after inactivity (wakes on request)

### Railway Free Tier
- 512 MB RAM
- 1 GB disk
- $5/month credit
- Sleep after inactivity

### Production Recommendations

For production use:
1. **Neon**: Upgrade to Pro for always-on compute
2. **Railway**: Add Hobby plan ($5/month) for always-on
3. Set up monitoring alerts
4. Regular database backups

---

## Support

- **Neon Docs**: https://neon.tech/docs
- **Railway Docs**: https://docs.railway.app
- **Prisma Docs**: https://prisma.io/docs

---

## Security Checklist

- [ ] Strong JWT_SECRET generated
- [ ] Database connection uses SSL (`sslmode=require`)
- [ ] Email credentials stored in Railway (not in code)
- [ ] Custom domain with HTTPS configured
- [ ] Database has strong password
- [ ] Admin user has strong password
- [ ] Regular dependency updates

---

**Your Engage by Capstone app is now live!** 🚀
