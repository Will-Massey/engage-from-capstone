# Engage Render Deployment - Troubleshooting Guide

## Current Status
- ✅ Database: `engage-db` - DEPLOYED
- ❌ Backend: `engage-backend` - FAILED
- ❌ Frontend: `engage-frontend` - FAILED

---

## How to Check Logs

### In Render Dashboard:
1. Go to: https://dashboard.render.com
2. Click on `engage-backend`
3. Click **Logs** tab
4. Look for red error messages

### Common Issues & Fixes

---

## Issue 1: Build Command Path Problems

**Symptom:** "Cannot find module" or "npm ci failed"

**Fix:** The build command uses `cd ../shared` but Render runs from the backend directory. Let's update:

```yaml
buildCommand: |
  echo "=== ENGAGE BACKEND BUILD ===" &&
  npm ci &&
  cd ../shared && npm ci && npm run build &&
  cd ../backend && npx prisma generate && npm run build
```

The paths might need adjustment. Try:
```yaml
buildCommand: |
  npm ci && cd shared && npm ci && npm run build && cd ../backend && npx prisma generate && npm run build
```

---

## Issue 2: Root Directory Setting

**Symptom:** Build can't find files

**Fix:** Remove `rootDir: backend` and adjust build commands:

```yaml
services:
  - type: web
    name: engage-backend
    runtime: node
    plan: standard
    buildCommand: |
      cd backend && npm ci && 
      cd ../shared && npm ci && npm run build && 
      cd ../backend && npx prisma generate && npm run build
    startCommand: cd backend && npm start
```

---

## Issue 3: Database Connection

**Symptom:** "Can't reach database" or Prisma errors

**Fix:** Check DATABASE_URL is properly set:
1. Go to `engage-backend` → Environment
2. Verify `DATABASE_URL` exists
3. Should be auto-set from `engage-db`

---

## Issue 4: Missing Environment Variables

**Symptom:** "JWT_SECRET not set" or similar

**Fix:** Add required env vars in Render Dashboard:
- `JWT_SECRET` - Generate with: `openssl rand -base64 32`
- `EMAIL_FROM_ADDRESS` - `sales@capstonesoftware.co.uk`

---

## Quick Fix: Manual Deploy (No Blueprint)

If Blueprint keeps failing, deploy manually:

### 1. Backend (Manual)
1. Render Dashboard → New → Web Service
2. Connect GitHub repo
3. **Name:** `engage-backend`
4. **Root Directory:** `backend`
5. **Build Command:**
   ```bash
   npm ci && cd ../shared && npm ci && npm run build && cd ../backend && npx prisma generate && npm run build
   ```
6. **Start Command:** `npm start`
7. **Add Environment Variables** manually

### 2. Frontend (Manual)
1. Render Dashboard → New → Static Site
2. Connect GitHub repo
3. **Name:** `engage-frontend`
4. **Root Directory:** `frontend`
5. **Build Command:**
   ```bash
   npm ci && cd ../shared && npm ci && npm run build && cd ../frontend && npm run build
   ```
6. **Publish Directory:** `dist`
7. **Env Var:** `VITE_API_URL` = your backend URL

---

## Alternative: Fix Blueprint

Update `render.yaml`:

```yaml
services:
  - type: web
    name: engage-backend
    runtime: node
    plan: standard
    buildCommand: npm ci && cd shared && npm ci && npm run build && cd backend && npx prisma generate && npm run build
    startCommand: cd backend && npm start
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: engage-db
          property: connectionString
      # ... rest of env vars
```

---

## Need Help?

1. Check Render logs for exact error
2. Share the error message with me
3. Or try manual deployment steps above
