# 🚀 Quick Deploy to Render

## One-Click Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://dashboard.render.com/select-repo?type=blueprint)

Click the button above to deploy instantly using the Blueprint.

---

## Manual Steps

### Step 1: Push Code to GitHub

**Mac/Linux:**
```bash
chmod +x deploy-to-render.sh
./deploy-to-render.sh
```

**Windows:**
```powershell
.\deploy-to-render.ps1
```

Or manually:
```bash
git add -A
git commit -m "fix: Finalize app for deployment"
git push origin master
```

---

### Step 2: Deploy via Blueprint

1. Go to: https://dashboard.render.com/select-repo?type=blueprint
2. Connect your GitHub account
3. Select repository: `Will-Massey/engage-from-capstone`
4. Click **Apply**

Render will automatically create:
- ✅ PostgreSQL database
- ✅ Backend API service
- ✅ Frontend static site

---

### Step 3: Set Environment Variables

After deployment, go to Render Dashboard and set these:

#### Backend Service (`engage-backend`)

| Variable | Value | How to Get |
|----------|-------|------------|
| `JWT_SECRET` | Random string | Run: `openssl rand -base64 32` |
| `SMTP_USER` | william@capstonesoftware.co.uk | Your email |
| `SMTP_PASS` | ******** | Your email password |
| `COMPANIES_HOUSE_API_KEY` | ******** | https://developer.company-information.service.gov.uk |
| `STRIPE_SECRET_KEY` | sk_live_... | https://dashboard.stripe.com |

---

### Step 4: Run Database Migrations

1. Go to Render Dashboard → `engage-backend` → Shell
2. Run:
```bash
npx prisma migrate deploy
```

3. (Optional) Seed database:
```bash
npx prisma db seed
```

---

### Step 5: Verify Deployment

Test your deployed app:

```bash
# Health check
curl https://engage-backend-xxx.onrender.com/ping

# Should return: {"status":"ok"}
```

Visit your frontend URL and test login with demo credentials.

---

## URLs After Deployment

| Service | URL Pattern |
|---------|-------------|
| Frontend | `https://engage-frontend-xxx.onrender.com` |
| Backend | `https://engage-backend-xxx.onrender.com` |
| API Health | `https://engage-backend-xxx.onrender.com/ping` |

---

## Troubleshooting

### Build Fails
- Check Render logs for specific errors
- Ensure `npx prisma generate` runs before build
- Verify all environment variables are set

### Database Connection Error
- Make sure `DATABASE_URL` is set correctly
- Check PostgreSQL service is running
- Verify connection string format

### CORS Errors
- Update `FRONTEND_URL` in backend environment variables
- Must match exact frontend URL with `https://`

---

## Need Help?

- Render Docs: https://render.com/docs
- Check logs in Render Dashboard
- Review `DEPLOY_RENDER.md` for detailed instructions
