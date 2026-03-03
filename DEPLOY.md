# Deploy to Railway + Neon

## 1. Setup Neon PostgreSQL

1. Go to https://neon.tech and sign up
2. Create a new project
3. Create a database named `uk_proposals`
4. Copy the connection string (looks like):
   ```
   postgresql://username:password@ep-xxx.us-east-1.aws.neon.tech/uk_proposals?sslmode=require
   ```

## 2. Deploy Backend to Railway

### Option A: Using Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
cd C:\Users\willi\Desktop\uk-proposal-platform
railway init

# Add PostgreSQL variable
railway variables set DATABASE_URL="your-neon-connection-string"
railway variables set JWT_SECRET="your-super-secret-jwt-key-min-32-chars-long"
railway variables set NODE_ENV="production"
railway variables set FRONTEND_URL="https://your-frontend-url.vercel.app"

# Deploy
railway up
```

### Option B: Using Railway Dashboard

1. Go to https://railway.app
2. Create New Project → Deploy from GitHub repo
3. Select your repository
4. Add environment variables in Railway Dashboard:
   - `DATABASE_URL` = Your Neon connection string
   - `JWT_SECRET` = A secure random string (32+ chars)
   - `NODE_ENV` = `production`
   - `FRONTEND_URL` = Your frontend URL (or `*` for now)

5. Deploy!

## 3. Deploy Frontend to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd frontend
vercel

# Set environment variable for API URL
vercel env add VITE_API_URL
# Enter: https://your-railway-app-url.up.railway.app
```

Or use Vercel Dashboard:
1. Go to https://vercel.com
2. Import GitHub repository
3. Set root directory to `frontend`
4. Add environment variable:
   - `VITE_API_URL` = Your Railway backend URL

## 4. Update CORS

After deployment, update `FRONTEND_URL` in Railway to match your Vercel URL.

## Quick Deploy Script (Windows)

Run this PowerShell script:

```powershell
# Deploy to Railway
$env:DATABASE_URL = "your-neon-url"
$env:JWT_SECRET = "your-jwt-secret"
railway up

# Deploy frontend to Vercel
cd frontend
vercel --prod
```

## Environment Variables Checklist

### Backend (Railway)
- [ ] `DATABASE_URL` - Neon PostgreSQL connection string
- [ ] `JWT_SECRET` - Secure random string (min 32 chars)
- [ ] `NODE_ENV` - `production`
- [ ] `FRONTEND_URL` - Vercel frontend URL
- [ ] `PORT` - `3001` (Railway sets this automatically)

### Frontend (Vercel)
- [ ] `VITE_API_URL` - Railway backend URL + `/api`

## Post-Deployment

1. Run migrations on Railway:
   ```bash
   railway run npx prisma migrate deploy
   ```

2. Seed the database:
   ```bash
   railway run npx prisma db seed
   ```

3. Visit your app!

## Troubleshooting

### Database Connection Issues
- Make sure Neon allows connections from Railway IPs
- Check that `sslmode=require` is in the DATABASE_URL

### CORS Errors
- Update `FRONTEND_URL` in Railway to exactly match your Vercel domain
- Include `https://` prefix

### Build Failures
- Check Railway logs for specific errors
- Make sure `npx prisma generate` runs before build
