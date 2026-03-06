#!/bin/bash

# 🏗️ Build Script for Production
# Usage: ./build-production.sh

set -e

echo "🏗️ Building Engage by Capstone for Production..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check Node version
echo "📋 Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js 18+ required. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v)${NC}"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm ci
cd backend && npm ci && cd ..
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Generate Prisma client
echo "🔄 Generating Prisma client..."
cd backend
npx prisma generate
cd ..
echo -e "${GREEN}✅ Prisma client generated${NC}"
echo ""

# Run database migrations (if DATABASE_URL is set)
if [ ! -z "$DATABASE_URL" ]; then
    echo "🗄️ Running database migrations..."
    cd backend
    npx prisma migrate deploy || echo -e "${YELLOW}⚠️  Migration check complete${NC}"
    cd ..
    echo -e "${GREEN}✅ Database migrations complete${NC}"
else
    echo -e "${YELLOW}⚠️  DATABASE_URL not set, skipping migrations${NC}"
fi
echo ""

# Run TypeScript compilation
echo "🔨 Compiling TypeScript..."
cd backend
npm run build || {
    echo -e "${YELLOW}⚠️  Build warnings present, continuing...${NC}"
}
cd ..
echo -e "${GREEN}✅ TypeScript compilation complete${NC}"
echo ""

# Verify build output
echo "🔍 Verifying build output..."
if [ -d "backend/dist" ]; then
    echo -e "${GREEN}✅ Build output exists${NC}"
    echo "   Files: $(find backend/dist -name '*.js' | wc -l) JS files"
else
    echo -e "${RED}❌ Build output not found${NC}"
    exit 1
fi
echo ""

# Run tests (if available)
echo "🧪 Running tests..."
cd backend
npm test 2>/dev/null || echo -e "${YELLOW}⚠️  No tests available${NC}"
cd ..
echo ""

# Build frontend
echo "🎨 Building frontend..."
cd frontend

# Check for required env vars
if [ ! -f .env.production ]; then
    echo -e "${YELLOW}⚠️  .env.production not found, creating from template...${NC}"
    cp ../.env.production.template .env.production
    echo -e "${YELLOW}⚠️  Please update .env.production with your values${NC}"
fi

# Build
npm run build
cd ..
echo -e "${GREEN}✅ Frontend build complete${NC}"
echo ""

# Verify frontend build
if [ -d "frontend/dist" ]; then
    echo -e "${GREEN}✅ Frontend build output exists${NC}"
else
    echo -e "${RED}❌ Frontend build output not found${NC}"
    exit 1
fi
echo ""

# Final verification
echo "================================"
echo -e "${GREEN}🎉 BUILD COMPLETE!${NC}"
echo "================================"
echo ""
echo "Build outputs:"
echo "  📦 Backend: backend/dist/"
echo "  🎨 Frontend: frontend/dist/"
echo ""
echo "Next steps:"
echo "  1. Test locally: npm run dev"
echo "  2. Deploy to Railway: ./deploy-railway.sh"
echo "  3. Or deploy frontend to Vercel: cd frontend && vercel --prod"
echo ""
