# Engage by Capstone - Render Free Tier Setup

## 🎯 Goal: Re-enable Backend on Render (FREE - $0/month)

**Cost Optimization:** Free tier auto-sleeps after 15 minutes of inactivity, preventing unexpected charges.

---

## 📊 What Changed

| Before (Costly)          | After (Free)                  |
| ------------------------ | ----------------------------- |
| `plan: standard` ($7/mo) | `plan: free` ($0/mo)          |
| Never sleeps             | Auto-sleeps after 15 min      |
| Always running           | Wakes on request (~30s delay) |
| Unexpected charges       | Zero cost                     |

---

## 🚀 Deployment Steps

### Option A: Blueprint Deploy (Easiest)

1. **Push your code to GitHub** (with the updated `render.yaml`):

   ```powershell
   git add render.yaml frontend/.env.production
   git commit -m "Switch to Render free tier"
   git push origin main
   ```

2. **Click the Deploy button:**
   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/select-repo?type=blueprint)

3. **Set secret environment variables** in Render Dashboard:
   - `SMTP_PASS` - Your email password
   - `COMPANIES_HOUSE_API_KEY` - (if you have one)
   - `STRIPE_SECRET_KEY` - (if using Stripe)

### Option B: Manual Deploy

Run the helper script:

```powershell
.\deploy-render-free.ps1
```

Or follow the manual steps in [DEPLOY_RENDER.md](./DEPLOY_RENDER.md)

---

## ⚙️ Environment Variables to Set

### In Render Dashboard (Backend Service):

| Variable                  | Value                                                                                | Required     |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------ |
| `DATABASE_URL`            | From your PostgreSQL service                                                         | ✅ Yes       |
| `JWT_SECRET`              | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | ✅ Yes       |
| `FRONTEND_URL`            | Your frontend URL (e.g., `https://engage-frontend-xxxxx.onrender.com`)               | ✅ Yes       |
| `SMTP_PASS`               | Your SMTP password                                                                   | ⚠️ For email |
| `COMPANIES_HOUSE_API_KEY` | Companies House API key                                                              | ❌ Optional  |
| `STRIPE_SECRET_KEY`       | Stripe secret key                                                                    | ❌ Optional  |

### In Render Dashboard (Frontend Service):

| Variable       | Value                                                                | Required |
| -------------- | -------------------------------------------------------------------- | -------- |
| `VITE_API_URL` | Your backend URL (e.g., `https://engage-backend-xxxxx.onrender.com`) | ✅ Yes   |

---

## 🧪 Post-Deployment Checklist

### 1. Health Check

```bash
curl https://engage-backend-xxxxx.onrender.com/ping
# Expected: {"status":"ok","timestamp":"..."}
```

### 2. Database Migrations

In Render Dashboard:

- Go to Backend Service → Shell
- Run: `npx prisma migrate deploy`
- Optional seed: `npx prisma db seed`

### 3. Test Login

- Visit: `https://engage-frontend-xxxxx.onrender.com/login`
- Login with: `admin@demo.practice` / `DemoPass123!`

### 4. Verify Core Features

- [ ] Create a client
- [ ] Create a proposal
- [ ] Generate PDF
- [ ] Send email (if SMTP configured)

---

## 💰 Cost Summary

| Service              | Plan | Monthly Cost |
| -------------------- | ---- | ------------ |
| Backend Web Service  | Free | **$0**       |
| Frontend Static Site | Free | **$0**       |
| PostgreSQL Database  | Free | **$0**       |
| **TOTAL**            |      | **$0**       |

### Free Tier Limits:

- **Web Service:** Sleeps after 15 min inactivity, 512 MB RAM
- **PostgreSQL:** 1GB storage, expires after 90 days
- **Bandwidth:** 100GB/month
- **Build Minutes:** 500/month

### When to Upgrade:

- Need 24/7 uptime (no sleep delay)
- Database > 1GB
- More than 100GB bandwidth
- Team collaboration features

**Starter Tier Cost:** $7/month (web service) + $7/month (database) = **$14/month**

---

## ⚠️ Important Notes

### 1. Cold Start Delay

- First request after 15 min of inactivity takes ~30 seconds
- Subsequent requests are fast
- Keepalive ping can prevent sleep if needed (but costs will apply)

### 2. Database Expiry

- Free PostgreSQL expires after 90 days
- **Backup before expiry!**
- Upgrade to Starter ($7/mo) for permanent database

### 3. Data Upload Costs

- **Upload is FREE** (included in bandwidth)
- PDF generation, file uploads - no extra cost
- Only pay if you exceed 100GB/month bandwidth (very unlikely)

---

## 🔧 Troubleshooting

### Service Won't Start

Check logs in Render Dashboard:

- Missing environment variables?
- Database connection failing?
- Build errors?

### CORS Errors

Update `FRONTEND_URL` in backend environment variables to match actual frontend URL

### Database Connection Failed

- Ensure `DATABASE_URL` includes `?sslmode=require`
- Check PostgreSQL service is running
- Verify credentials are correct

### Email Not Sending

- Verify SMTP credentials
- Check port 587 is correct
- Some providers require app-specific passwords

---

## 📞 Next Steps

1. ✅ Run `.\deploy-render-free.ps1` or use Blueprint
2. ✅ Set environment variables in Render Dashboard
3. ✅ Run database migrations
4. ✅ Test the deployment
5. ✅ (Optional) Set up custom domain

---

**Questions?** The deployment helper script will guide you through each step!
