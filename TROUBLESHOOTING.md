# Troubleshooting Guide

## Installation Issues

### npm install fails with ECONNRESET

**Problem:** Network timeout during package installation.

**Solutions:**

1. Use npm with longer timeout:
```powershell
npm config set fetch-timeout 120000
npm config set fetch-retries 5
npm install
```

2. Use yarn instead (if installed):
```powershell
npm install -g yarn
yarn install
```

3. Install from specific registry:
```powershell
npm install --registry https://registry.npmjs.org
```

### Prisma Schema Validation Error

**Problem:** If you see this error:
```
error: The datasource property `url` is no longer supported in schema files.
```

**Cause:** You have Prisma 7.x installed globally, but this project uses Prisma 5.x.

**Solution:**

1. Uninstall global Prisma:
```powershell
npm uninstall -g prisma
```

2. Use the local Prisma version:
```powershell
cd C:\Users\willi\Desktop\uk-proposal-platform\backend
npx prisma@5.22.0 migrate dev
```

Or update the package.json to use Prisma 7 (requires schema changes):
```powershell
# Edit backend/prisma/schema.prisma and remove the url line
# Then update package.json to use prisma 7
```

### "concurrently is not recognized"

**Problem:** The `concurrently` package isn't installed.

**Solution:** Use the batch file instead:
```powershell
.\start-dev.bat
```

Or start servers manually in separate windows.

### PostgreSQL Connection Failed

**Problem:** Can't connect to PostgreSQL database.

**Solutions:**

1. Check if PostgreSQL is running:
```powershell
Get-Service postgresql*
# If stopped, start it:
Start-Service postgresql-x64-14
```

2. Check your .env file:
```
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/uk_proposals"
```

3. Create the database manually:
```powershell
# Using psql
psql -U postgres -c "CREATE DATABASE uk_proposals;"

# Or using pgAdmin, create database named 'uk_proposals'
```

### Port Already in Use

**Problem:** Ports 3001 or 5173 are already being used.

**Solutions:**

1. Find and kill the process:
```powershell
# For port 3001
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# For port 5173
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

2. Or change the ports in the configuration:
- Backend: Edit `backend/.env` and change `PORT=3002`
- Frontend: Edit `frontend/vite.config.ts` and change the port in server config

### Node Modules Corrupted

**Problem:** Installation seems incomplete or corrupted.

**Solution:** Clean reinstall:
```powershell
# In each directory: shared, backend, frontend
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm cache clean --force
npm install
```

## Runtime Issues

### "Cannot find module"

**Problem:** TypeScript compilation or module resolution failure.

**Solution:**
```powershell
# Rebuild the shared package
cd shared
npm run build

# Then restart the servers
```

### JWT Token Errors

**Problem:** Authentication fails with token errors.

**Solution:**
1. Clear browser localStorage (the auth data is stored there)
2. Log out and log back in
3. Check that JWT_SECRET is set in backend/.env

### Database Migration Errors

**Problem:** Prisma migrations fail.

**Solutions:**

1. Reset the database:
```powershell
cd backend
npx prisma migrate reset
```

2. Or recreate the database:
```sql
DROP DATABASE uk_proposals;
CREATE DATABASE uk_proposals;
```

Then run migrations again:
```powershell
npx prisma migrate dev --name init
npx prisma db seed
```

### PDF Generation Fails

**Problem:** PDF download doesn't work.

**Solutions:**
1. Check that the backend is running
2. Check backend logs for errors
3. Ensure the uploads directory exists:
```powershell
mkdir backend\uploads
```

## Development Tips

### Hot Reload Not Working

If changes aren't being detected:
1. Restart the dev server
2. Check if files are being saved properly
3. Clear browser cache

### Environment Variables Not Loading

Make sure the `.env` file is in the correct location:
- Backend: `backend/.env`
- Frontend: `frontend/.env` (if needed for build-time variables)

### Slow Performance

1. Disable antivirus real-time scanning for the project folder
2. Use SSD instead of HDD
3. Close unnecessary applications
4. Increase Node.js memory:
```powershell
$env:NODE_OPTIONS="--max-old-space-size=4096"
```

## Getting Help

If you're still stuck:

1. Check the logs in the terminal windows
2. Look at the browser console (F12) for frontend errors
3. Check the backend console for API errors
4. Review the README.md and QUICKSTART.md files

Common error patterns:
- Database connection issues → Check PostgreSQL service
- Module not found → Run npm install
- Port conflicts → Kill existing processes or change ports
- Auth errors → Clear localStorage and re-login
