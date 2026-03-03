# Engage by Capstone - Quick Start Guide

## Prerequisites
- Node.js 18+ installed
- PostgreSQL 14+ installed and running
- Git (optional)

## Step 1: Install Dependencies Manually

Since npm install may have network issues, install each workspace separately:

```powershell
# 1. Install shared package
cd C:\Users\willi\Desktop\uk-proposal-platform\shared
npm install

# 2. Install backend
cd C:\Users\willi\Desktop\uk-proposal-platform\backend
npm install

# 3. Install frontend
cd C:\Users\willi\Desktop\uk-proposal-platform\frontend
npm install
```

## Step 2: Setup Database

1. Create a PostgreSQL database:
```sql
CREATE DATABASE uk_proposals;
```

2. Copy the environment file:
```powershell
cd C:\Users\willi\Desktop\uk-proposal-platform\backend
copy .env.example .env
```

3. Edit `.env` and update the DATABASE_URL:
```
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/uk_proposals"
```

4. Run migrations:
```powershell
cd C:\Users\willi\Desktop\uk-proposal-platform\backend
npx prisma migrate dev --name init
```

5. Seed the database:
```powershell
npx prisma db seed
```

## Step 3: Start Development Servers

### Option A: Using the batch file (Windows)
```powershell
cd C:\Users\willi\Desktop\uk-proposal-platform
.\start-dev.bat
```

### Option B: Manual startup
Open TWO separate PowerShell windows:

**Window 1 - Backend:**
```powershell
cd C:\Users\willi\Desktop\uk-proposal-platform\backend
npm run dev
```

**Window 2 - Frontend:**
```powershell
cd C:\Users\willi\Desktop\uk-proposal-platform\frontend
npm run dev
```

## Step 4: Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- API Health Check: http://localhost:3001/health

## Demo Credentials

- Email: `admin@demo.practice`
- Password: `DemoPass123!`
- Subdomain: `demo`

## Troubleshooting

### Issue: npm install fails with network errors
**Solution:** Try using a different npm registry:
```powershell
npm config set registry https://registry.npmjs.org/
npm cache clean --force
```

### Issue: Prisma migration fails
**Solution:** Make sure PostgreSQL is running and the database exists:
```powershell
# Check if PostgreSQL is running
Get-Service postgresql*

# Create database manually
psql -U postgres -c "CREATE DATABASE uk_proposals;"
```

### Issue: Port already in use
**Solution:** Kill processes using ports 3001 or 5173:
```powershell
# Find and kill process on port 3001
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### Issue: Node modules corrupted
**Solution:** Delete node_modules and reinstall:
```powershell
# In each directory (shared, backend, frontend)
Remove-Item -Recurse -Force node_modules
Remove-Item package-lock.json
npm install
```

## Production Deployment

For production deployment:

1. Build the frontend:
```powershell
cd C:\Users\willi\Desktop\uk-proposal-platform\frontend
npm run build
```

2. Set environment variables:
```
NODE_ENV=production
JWT_SECRET=your-super-secret-key
DATABASE_URL=your-production-db-url
```

3. Start the backend:
```powershell
cd C:\Users\willi\Desktop\uk-proposal-platform\backend
npm start
```

## Support

For issues or questions, check the main README.md file or create an issue on GitHub.
