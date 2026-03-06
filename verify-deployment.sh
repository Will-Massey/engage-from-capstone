#!/bin/bash

# 🔍 Deployment Verification Script
# Usage: ./verify-deployment.sh

echo "🔍 Verifying Engage by Capstone Deployment..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# Function to check and report
check() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅${NC} $2"
    else
        echo -e "${RED}❌${NC} $2"
        ERRORS=$((ERRORS+1))
    fi
}

warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
    WARNINGS=$((WARNINGS+1))
}

# ==========================================
# FILE STRUCTURE CHECKS
# ==========================================
echo "📁 Checking file structure..."
test -f "railway.toml" && check 0 "railway.toml exists" || check 1 "railway.toml missing"
test -f "Dockerfile" && check 0 "Dockerfile exists" || check 1 "Dockerfile missing"
test -f "package.json" && check 0 "package.json exists" || check 1 "package.json missing"
test -d "backend" && check 0 "backend directory exists" || check 1 "backend directory missing"
test -d "frontend" && check 0 "frontend directory exists" || check 1 "frontend directory missing"
echo ""

# ==========================================
# BACKEND CHECKS
# ==========================================
echo "🔧 Checking backend..."
cd backend

test -f "package.json" && check 0 "backend/package.json exists" || check 1 "backend/package.json missing"
test -d "src" && check 0 "backend/src exists" || check 1 "backend/src missing"
test -d "prisma" && check 0 "backend/prisma exists" || check 1 "backend/prisma missing"
test -f "prisma/schema.prisma" && check 0 "Prisma schema exists" || check 1 "Prisma schema missing"

# Check for critical security issues
if grep -q "contentSecurityPolicy: false" src/index.ts 2>/dev/null; then
    check 1 "CSP is disabled (security risk)"
else
    check 0 "CSP is enabled"
fi

if grep -q "'your-secret-key'" src/middleware/auth.ts 2>/dev/null; then
    check 1 "JWT has fallback secret (security risk)"
else
    check 0 "JWT secret properly configured"
fi

if grep -q "rejectUnauthorized: false" src/services/emailService.ts 2>/dev/null; then
    warning "SMTP TLS verification disabled"
else
    check 0 "SMTP TLS verification enabled"
fi

cd ..
echo ""

# ==========================================
# FRONTEND CHECKS
# ==========================================
echo "🎨 Checking frontend..."
cd frontend

test -f "package.json" && check 0 "frontend/package.json exists" || check 1 "frontend/package.json missing"
test -d "src" && check 0 "frontend/src exists" || check 1 "frontend/src missing"
test -f "index.html" && check 0 "index.html exists" || check 1 "index.html missing"

cd ..
echo ""

# ==========================================
# DATABASE CHECKS
# ==========================================
echo "🗄️ Checking database..."
if command -v psql &> /dev/null; then
    if [ ! -z "$DATABASE_URL" ]; then
        psql "$DATABASE_URL" -c "SELECT 1" > /dev/null 2>&1 && check 0 "Database connection successful" || check 1 "Database connection failed"
    else
        warning "DATABASE_URL not set, skipping connection test"
    fi
else
    warning "psql not installed, skipping database check"
fi

if [ -d "backend/node_modules/.prisma" ]; then
    check 0 "Prisma client generated"
else
    check 1 "Prisma client not generated"
fi
echo ""

# ==========================================
# BUILD CHECKS
# ==========================================
echo "🏗️ Checking build status..."
test -d "backend/dist" && check 0 "Backend built" || warning "Backend not built (run ./build-production.sh)"
test -d "frontend/dist" && check 0 "Frontend built" || warning "Frontend not built"
echo ""

# ==========================================
# RUNNING SERVICES CHECKS
# ==========================================
echo "🚀 Checking running services..."

# Check if backend is running
if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    check 0 "Backend is running on port 3001"
    
    # Test health endpoint
    HEALTH=$(curl -s http://localhost:3001/api/health)
    if echo "$HEALTH" | grep -q "healthy"; then
        check 0 "Health endpoint responding"
    else
        check 1 "Health endpoint unhealthy"
    fi
else
    warning "Backend not running on port 3001"
fi

# Check if frontend is running
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    check 0 "Frontend is running on port 5173"
else
    warning "Frontend not running on port 5173"
fi
echo ""

# ==========================================
# ENVIRONMENT CHECKS
# ==========================================
echo "⚙️ Checking environment..."
test -f ".env.production" && check 0 ".env.production exists" || warning ".env.production not found"
test -f ".env" && check 0 ".env exists" || warning ".env not found"

if [ -f ".env.production" ]; then
    grep -q "JWT_SECRET" .env.production && check 0 "JWT_SECRET configured" || check 1 "JWT_SECRET missing"
    grep -q "NODE_ENV=production" .env.production && check 0 "NODE_ENV set to production" || warning "NODE_ENV not set to production"
fi
echo ""

# ==========================================
# GIT CHECKS
# ==========================================
echo "📦 Checking git repository..."
if [ -d ".git" ]; then
    check 0 "Git repository initialized"
    
    # Check for uncommitted changes
    if git diff-index --quiet HEAD --; then
        check 0 "No uncommitted changes"
    else
        warning "Uncommitted changes present"
    fi
    
    # Check .gitignore
    if [ -f ".gitignore" ]; then
        check 0 ".gitignore exists"
        grep -q ".env" .gitignore && check 0 ".env files ignored" || warning ".env files not in .gitignore"
    else
        check 1 ".gitignore missing"
    fi
else
    warning "Not a git repository"
fi
echo ""

# ==========================================
# SUMMARY
# ==========================================
echo "================================"
echo "📊 VERIFICATION SUMMARY"
echo "================================"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL CHECKS PASSED!${NC}"
    echo ""
    echo "Ready for deployment! 🚀"
    echo ""
    echo "Next steps:"
    echo "  ./build-production.sh"
    echo "  ./deploy-railway.sh"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  PASSED WITH WARNINGS${NC}"
    echo ""
    echo "Warnings: $WARNINGS"
    echo ""
    echo "You can proceed with deployment, but consider addressing warnings."
    exit 0
else
    echo -e "${RED}❌ VERIFICATION FAILED${NC}"
    echo ""
    echo "Errors: $ERRORS"
    echo "Warnings: $WARNINGS"
    echo ""
    echo "Please fix errors before deploying."
    exit 1
fi
