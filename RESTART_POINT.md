# Engage by Capstone - Restart Point
**Date:** 2026-03-04  
**Status:** OAuth implementation in progress - Service Worker caching issue

---

## Current Live URLs

| Component | URL | Status |
|-----------|-----|--------|
| **Frontend** | https://frontend-775lvcftj-will-masseys-projects-b935486d.vercel.app | Deployed |
| **Backend API** | https://engage-by-capstone-production.up.railway.app | Deployed |

---

## What Was Being Worked On

### OAuth Implementation (Microsoft 365/Outlook)
**Status:** Backend working, frontend Service Worker caching issue

**Problem:**
- OAuth callback from Microsoft hits backend successfully ✓
- Backend redirects to frontend ✓
- Service Worker intercepts the callback and serves cached HTML instead of letting request reach backend

**Backend OAuth Routes (Working):**
- `GET /api/oauth/callback/outlook` - Handles Outlook OAuth callback
- `GET /api/oauth/callback/microsoft365` - Handles Microsoft 365 OAuth callback  
- `GET /api/oauth/callback/gmail` - Handles Gmail OAuth callback

**Frontend Changes Made:**
- Added `navigateFallbackDenylist: [/^\/api/, /^\/uploads/]` to vite.config.ts
- Added `globIgnores: ['**/api/**', '**/uploads/**']` to vite.config.ts
- Created OAuthConnect component for email settings
- Updated Settings.tsx to handle OAuth callbacks

---

## Azure Configuration (Capstone Engage App)

**Client ID:** `33ad7f5f-6b5f-4635-9e3c-d47968d9c874`  
**Tenant ID:** `6534c139-7a2b-4df3-bb4b-0014f58cde83`  
**Supported Account Types:** "Any Entra ID Tenant + Personal Microsoft accounts" ✓

**Required Redirect URIs in Azure:**
```
https://engage-by-capstone-production.up.railway.app/api/oauth/callback/outlook
https://engage-by-capstone-production.up.railway.app/api/oauth/callback/microsoft365
https://engage-by-capstone-production.up.railway.app/api/oauth/callback/gmail
```

---

## Railway Environment Variables (Backend)

| Variable | Value | Status |
|----------|-------|--------|
| `FRONTEND_URL` | `https://frontend-775lvcftj-will-masseys-projects-b935486d.vercel.app` | Updated |
| `MICROSOFT_CLIENT_ID` | `33ad7f5f-6b5f-4635-9e3c-d47968d9c874` | Set |
| `MICROSOFT_CLIENT_SECRET` | `[Secret - see Azure]` | Set |
| `MICROSOFT_TENANT_ID` | `6534c139-7a2b-4df3-bb4b-0014f58cde83` | Set |
| `COMPANIES_HOUSE_API_KEY` | `a26fc9f7-03b0-4d75-a715-a95bcb785416` | Set |

---

## What Still Needs to Be Done

### Immediate: Fix OAuth Service Worker Issue

**Options to try:**

1. **Disable PWA/Service Worker temporarily** in vite.config.ts:
   ```typescript
   // Comment out or remove VitePWA plugin
   ```

2. **Add runtime caching rule** to exclude API routes:
   ```typescript
   workbox: {
     runtimeCaching: [
       {
         urlPattern: /^\/api\/.*/,
         handler: 'NetworkOnly',
       },
     ],
   }
   ```

3. **Clear browser cache completely** and test in Incognito mode

### After OAuth is Working:

1. **Test Companies House search** - Should be working now
2. **Complete email integration** - OAuth → Save tokens → Send test email
3. **Proposal PDF email sending** with attachments

---

## Key Files Modified

### Backend:
- `backend/src/index.ts` - OAuth callback routes added
- `backend/src/routes/email.ts` - OAuth routes for email settings
- `backend/src/services/emailService.ts` - Microsoft OAuth methods

### Frontend:
- `frontend/vite.config.ts` - Service Worker config (needs fix)
- `frontend/src/pages/Settings.tsx` - OAuth callback handling
- `frontend/src/components/email/EmailSettings.tsx` - Email settings UI
- `frontend/src/components/email/OAuthConnect.tsx` - OAuth connect component

---

## Git Status

**Branch:** master  
**Remote:** https://github.com/Will-Massey/engage-from-capstone.git  
**Last Commit:** OAuth implementation updates  

All changes are committed and pushed to GitHub.

---

## Quick Start After Restart

1. Open: https://frontend-775lvcftj-will-masseys-projects-b935486d.vercel.app
2. Clear browser cache (DevTools → Application → Clear site data)
3. Test OAuth: Settings → Integrations → Connect Microsoft 365
4. If still 404, check backend logs: `railway logs --service="engage-by-capstone"`

---

## Emergency Contacts/Issues

- **Railway Dashboard:** https://railway.com/project/2ff2d4b2-5134-41a5-a8b1-49c3827baec9
- **Azure Portal:** https://portal.azure.com → App registrations → "Capstone Engage"
- **Vercel Dashboard:** https://vercel.com/will-masseys-projects-b935486d

---

**Created:** 2026-03-04  
**Ready for restart:** ✓
