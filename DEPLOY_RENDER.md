# 🚀 Deploy Engage to Render

## Quick Deploy (Blueprint)

Click this button to deploy using the Blueprint:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/select-repo?type=blueprint)

---

## Manual Deploy Steps

### Step 1: Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **PostgreSQL**
3. Name: `engage-db`
4. Plan: **Starter** ($7/month)
5. Database: `engage_production`
6. User: `engage_user`
7. Click **Create Database**
8. Copy the **Internal Database URL** (we'll need it later)

---

### Step 2: Deploy Backend

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `engage-backend`
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**:
     ```bash
     npm ci && cd ../shared && npm ci && npm run build && cd ../backend && npx prisma generate && npm run build
     ```
   - **Start Command**: `npm start`
5. Click **Advanced** → Add Environment Variables:

   | Key | Value | Notes |
   |-----|-------|-------|
   | `NODE_ENV` | `production` | |
   | `PORT` | `10000` | Render default |
   | `DATABASE_URL` | *from Step 1* | PostgreSQL connection string |
   | `JWT_SECRET` | *generate* | Use `openssl rand -base64 32` |
   | `FRONTEND_URL` | `https://engage-frontend.onrender.com` | Update after frontend deploy |
   | `EMAIL_PROVIDER` | `smtp` | |
   | `SMTP_HOST` | `smtp.123-reg.co.uk` | Your SMTP server |
   | `SMTP_PORT` | `587` | |
   | `SMTP_USER` | `william@capstonesoftware.co.uk` | Your email |
   | `SMTP_PASS` | *secret* | Your SMTP password |
   | `COMPANIES_HOUSE_API_KEY` | *secret* | From Companies House |
   | `STRIPE_SECRET_KEY` | *secret* | From Stripe Dashboard |
   | `STRIPE_PUBLISHABLE_KEY` | *secret* | From Stripe Dashboard |

6. Click **Create Web Service**

---

### Step 3: Run Database Migrations

After the backend deploys, run migrations:

1. Go to your `engage-backend` service in Render Dashboard
2. Click **Shell** tab
3. Run:
   ```bash
   npx prisma migrate deploy
   ```
4. (Optional) Seed the database:
   ```bash
   npx prisma db seed
   ```

---

### Step 4: Deploy Frontend

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New** → **Static Site**
3. Connect your GitHub repository
4. Configure:
   - **Name**: `engage-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**:
     ```bash
     npm ci && cd ../shared && npm ci && npm run build && cd ../frontend && npm run build
     ```
   - **Publish Directory**: `dist`
5. Add Environment Variable:
   - `VITE_API_URL` = `https://engage-backend.onrender.com` (your backend URL)
6. Click **Create Static Site**

---

### Step 5: Update CORS

1. Go to your `engage-backend` service
2. Update the `FRONTEND_URL` environment variable to match your actual frontend URL:
   - Example: `https://engage-frontend-abc123.onrender.com`
3. The backend will redeploy automatically

---

### Step 6: Verify Deployment

Test your deployment:

```bash
# Health check
curl https://engage-backend-xxxx.onrender.com/api/health

# Should return:
# {"success":true,"data":{"status":"healthy","database":"connected"}}
```

Visit your frontend URL and test login with demo credentials:
- Email: `admin@demo.practice`
- Password: `DemoPass123!`

---

## Environment Variables Reference

### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `10000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `JWT_SECRET` | JWT signing key (min 32 chars) | Random string |
| `FRONTEND_URL` | Frontend domain | `https://...onrender.com` |

### Email (SMTP)
| Variable | Description | Example |
|----------|-------------|---------|
| `EMAIL_PROVIDER` | Email service type | `smtp` |
| `SMTP_HOST` | SMTP server | `smtp.123-reg.co.uk` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | `william@capstonesoftware.co.uk` |
| `SMTP_PASS` | SMTP password | *secret* |

### Payments (Stripe)
| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_PUBLISHABLE_KEY` | Stripe public key | `pk_live_...` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | `whsec_...` |

### Integrations
| Variable | Description |
|----------|-------------|
| `COMPANIES_HOUSE_API_KEY` | Companies House API |
| `MICROSOFT_CLIENT_ID` | Azure AD OAuth |
| `MICROSOFT_CLIENT_SECRET` | Azure AD OAuth |
| `MICROSOFT_TENANT_ID` | Azure AD Tenant |

---

## Custom Domain (Optional)

1. Go to your service in Render Dashboard
2. Click **Settings** → **Custom Domain**
3. Add your domain (e.g., `engage.capstonesoftware.co.uk`)
4. Follow DNS configuration instructions
5. Update `FRONTEND_URL` and `API_URL` accordingly

---

## Troubleshooting

### Build Failures
```bash
# Check build logs in Render Dashboard
# Common issues:
# 1. Missing environment variables
# 2. Database connection issues
# 3. TypeScript compilation errors
```

### Database Connection Issues
- Ensure `DATABASE_URL` includes `?sslmode=require`
- Check that PostgreSQL service is running
- Verify database user has correct permissions

### CORS Errors
- Update `FRONTEND_URL` in backend to match actual frontend URL
- Check browser console for blocked requests
- Ensure URL includes `https://` prefix

### Email Not Sending
- Verify SMTP credentials
- Check spam folders
- Test with a different email provider (Gmail, SendGrid)

---

## Costs

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| PostgreSQL | Starter | $7 |
| Backend | Starter | $7 |
| Frontend | Static | Free |
| **Total** | | **$14/month** |

---

## Support

- Render Docs: https://render.com/docs
- Prisma Docs: https://www.prisma.io/docs
- Need help? Check the Render community forum
