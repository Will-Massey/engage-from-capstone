# Render API Setup Guide

Quick automated deployment for Engage using Render API.

## Setup (One-time, 5 minutes)

### 1. Get Your API Key
1. Go to: https://dashboard.render.com/settings/api-keys
2. Click **"Create API Key"**
3. Name it "Engage Deploy"
4. Copy the key (starts with `rnd_`)

### 2. Get Service IDs
1. Backend: Open https://dashboard.render.com/web/engage-backend
   - Look at URL or click Settings → copy Service ID
2. Frontend: Open https://dashboard.render.com/static/engage-frontend
   - Look at URL or click Settings → copy Service ID

### 3. Set Environment Variables

**Option A: Local PC (recommended for development)**

```bash
# macOS/Linux - Add to ~/.bashrc or ~/.zshrc
export RENDER_API_KEY="rnd_xxxxxxxxxxxx"
export RENDER_BACKEND_SERVICE_ID="srv-xxxxxxxxxxxxx"
export RENDER_FRONTEND_SERVICE_ID="srv-xxxxxxxxxxxxx"

# Then reload
source ~/.bashrc  # or ~/.zshrc
```

```powershell
# Windows PowerShell - Add to $PROFILE
$env:RENDER_API_KEY = "rnd_xxxxxxxxxxxx"
$env:RENDER_BACKEND_SERVICE_ID = "srv-xxxxxxxxxxxxx"
$env:RENDER_FRONTEND_SERVICE_ID = "srv-xxxxxxxxxxxxx"
```

**Option B: GitHub Actions (for auto-deploy on push)**

1. Go to: https://github.com/Will-Massey/engage-from-capstone/settings/secrets/actions
2. Add these secrets:
   - `RENDER_API_KEY`
   - `RENDER_BACKEND_SERVICE_ID`
   - `RENDER_FRONTEND_SERVICE_ID`

## Usage

### Local Deployment (Any PC)

```bash
# Deploy both services
./scripts/deploy.sh
./scripts/deploy.sh all

# Deploy just backend
./scripts/deploy.sh backend
./scripts/deploy.sh b

# Deploy just frontend
./scripts/deploy.sh frontend
./scripts/deploy.sh f

# Check service status
./scripts/deploy.sh status
./scripts/deploy.sh s
```

```powershell
# Windows PowerShell
.\scripts\deploy.ps1
.\scripts\deploy.ps1 backend
.\scripts\deploy.ps1 frontend
.\scripts\deploy.ps1 status
```

### GitHub Actions Auto-Deploy

Push to `master` branch automatically triggers deployment:

```bash
git add .
git commit -m "your changes"
git push origin master  # Auto-deploys!
```

Or trigger manually:
- Go to: https://github.com/Will-Massey/engage-from-capstone/actions
- Click **"Deploy to Render"** → **"Run workflow"**

## Time Saved

| Method | Time per deploy | At 25 deploys/day |
|--------|-----------------|-------------------|
| Dashboard clicks | 30-60s | 12-25 min/day |
| API deploy | 2-3s | 1 min/day |
| **Savings** | **~90%** | **~20 min/day** |

That's **1.5+ hours per week** saved!

## Troubleshooting

### "RENDER_API_KEY not set"
Set the environment variable (see Step 3 above)

### "Failed to deploy"
- Check API key is valid: https://dashboard.render.com/settings/api-keys
- Verify service IDs are correct
- Check service exists and you have access

### Deploy not triggering via GitHub Actions
- Ensure secrets are set in GitHub (not just locally)
- Check Actions tab for error logs
