# GitHub Actions Auto-Deploy Setup

This guide sets up automatic deployment to Render whenever you push to GitHub.

## 🚀 What This Does

When you push to `master` or `main` branch:

1. ✅ Backend automatically deploys to Render
2. ✅ Frontend automatically deploys to Render (after backend)
3. ✅ No manual intervention needed!

## 📋 Setup Steps

### Step 1: Get Render API Key

1. Go to https://dashboard.render.com
2. Click your profile (top right) → **"Account Settings"**
3. Scroll down to **"API Keys"**
4. Click **"Create API Key"**
5. Name it: `GitHub Actions Deploy`
6. Copy the key (starts with `rnd_`)

### Step 2: Get Service IDs

**Backend Service ID:**

1. Go to https://dashboard.render.com
2. Click on `engage-backend`
3. Look at the URL or page - find the Service ID
   - It looks like: `srv-abc123def456`
   - Or check: Settings → General → Service ID

**Frontend Service ID:**

1. Click on `engage-frontend`
2. Find the Service ID (same format)

### Step 3: Add GitHub Secrets

1. Go to https://github.com/Will-Massey/engage-from-capstone
2. Click **"Settings"** tab
3. In left sidebar, click **"Secrets and variables"** → **"Actions"**
4. Click **"New repository secret"**

Add these 3 secrets:

| Secret Name                  | Value                    | Description      |
| ---------------------------- | ------------------------ | ---------------- |
| `RENDER_API_KEY`             | Your API key from Step 1 | `rnd_xxxxxxxxxx` |
| `RENDER_BACKEND_SERVICE_ID`  | Backend service ID       | `srv-xxxxxxxxxx` |
| `RENDER_FRONTEND_SERVICE_ID` | Frontend service ID      | `srv-xxxxxxxxxx` |

### Step 4: Test It!

1. Make any small change to the code
2. Push to GitHub:
   ```bash
   git add .
   git commit -m "test: Auto-deploy trigger"
   git push origin master
   ```
3. Go to https://github.com/Will-Massey/engage-from-capstone/actions
4. Watch the deployment happen automatically! 🎉

## 🔍 Monitoring Deployments

**GitHub:**

- Go to **Actions** tab in your repo
- See deployment status in real-time

**Render:**

- Go to https://dashboard.render.com
- Check deployment logs

## 🛠️ Troubleshooting

### "Secret not found" error

- Make sure secrets are added to **Repository** secrets (not Environment secrets)
- Check spelling: `RENDER_API_KEY` (all caps, underscores)

### Deployment fails

- Check Render service logs
- Verify service IDs are correct
- Ensure API key has permission to deploy

### Only one service deploys

- Check if `RENDER_BACKEND_SERVICE_ID` and `RENDER_FRONTEND_SERVICE_ID` are different
- Frontend waits for backend to finish (this is intentional)

## ✅ Verification

After setup, push any change and verify:

1. GitHub Actions shows green checkmarks ✅
2. Render dashboard shows new deployment
3. Your app updates with the changes

## 📝 Notes

- Deployments take 2-3 minutes
- Frontend deploys after backend successfully deploys
- You can manually trigger via GitHub Actions tab → "Run workflow"
- Free tier services may spin down after 15 min inactivity

---

**Need help?** Check Render docs: https://render.com/docs/deploy-hooks
