# TODO - Tomorrow's Tasks (March 7, 2026)

## 🔴 MUST DO (First 30 minutes)

### 1. Set Environment Variables in Railway
Go to: https://railway.app → engage-by-capstone → Variables

Add these:
```
FRONTEND_URL=https://engage.capstonesoftware.co.uk
ENCRYPTION_KEY=<generate-64-char-hex>
```

Generate ENCRYPTION_KEY:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Check Custom Domain SSL
Railway → Settings → Networking
- Verify: `engage.capstonesoftware.co.uk` is Valid ✅
- If not: Check 123-reg DNS CNAME is correct

### 3. Test API
```bash
curl https://engage.capstonesoftware.co.uk/ping
```
Should return: `{"status":"ok"}`

---

## 🟠 SHOULD DO (Next 2 hours)

### 4. Database Migration
In Railway or locally:
```bash
npx prisma migrate deploy
```

### 5. Seed Services
```bash
npx prisma db seed
```

### 6. Create Admin User
```bash
node backend/dist/create-superadmin.js
```
Or use the API directly

---

## 🟡 CAN DO (If time permits)

### 7. Email Configuration
Choose ONE:
- Gmail SMTP (easiest)
- Outlook SMTP
- SendGrid

### 8. PDF Generation
Implement `generateProposalPdf()` in proposals-share.ts

### 9. Frontend Decision
A) Deploy to Vercel/Netlify separately  
B) Serve from backend static files  
C) Railway static site

---

## 📊 Success Checklist

- [ ] API responds on custom domain
- [ ] Database has tables
- [ ] Can create/login user
- [ ] JWT tokens work

---

## 🔧 Quick Links

- Railway: https://railway.app/project/[project-id]
- GitHub: https://github.com/Will-Massey/engage-from-capstone
- Live API: https://capstone-saas-production.up.railway.app
- Target Domain: https://engage.capstonesoftware.co.uk

---

**Full Details:** See `RESTART_POINT.md`
