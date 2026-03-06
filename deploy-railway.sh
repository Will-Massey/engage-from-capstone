#!/bin/bash

# 🚀 Engage by Capstone - Railway Deployment Script
# Usage: ./deploy-railway.sh

set -e

echo "🚀 Starting Railway Deployment..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v railway &> /dev/null; then
    echo -e "${RED}❌ Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 20+${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites checked${NC}"
echo ""

# Login to Railway
echo "🔑 Logging into Railway..."
railway login
echo ""

# Initialize project if not already
echo "📦 Setting up Railway project..."
if [ ! -f .railway/config.json ]; then
    echo "Creating new project..."
    railway init
else
    echo "Using existing project..."
fi
echo ""

# Add PostgreSQL if not exists
echo "🗄️ Checking PostgreSQL database..."
echo -e "${YELLOW}⚠️  Make sure to add PostgreSQL plugin in Railway dashboard if not already added${NC}"
echo "   Railway Dashboard → New → Database → PostgreSQL"
echo ""
read -p "Press Enter when PostgreSQL is added..."
echo ""

# Generate JWT secret
echo "🔐 Generating JWT secret..."
JWT_SECRET=$(openssl rand -base64 32)
echo -e "${GREEN}Generated JWT_SECRET${NC}"
echo ""

# Set environment variables
echo "⚙️  Setting environment variables..."

# Required variables
railway variables set NODE_ENV=production
railway variables set PORT=3001
railway variables set JWT_SECRET="$JWT_SECRET"

# Database (will be auto-populated by Railway if PostgreSQL plugin added)
echo -e "${YELLOW}⚠️  Make sure DATABASE_URL is set by Railway PostgreSQL plugin${NC}"
echo ""

# Email settings (optional for now)
echo "📧 Email configuration (press Enter to skip):"
read -p "SMTP_HOST [smtp.gmail.com]: " SMTP_HOST
SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}
read -p "SMTP_PORT [587]: " SMTP_PORT
SMTP_PORT=${SMTP_PORT:-587}
read -p "SMTP_USER: " SMTP_USER
read -sp "SMTP_PASS: " SMTP_PASS
echo ""

if [ ! -z "$SMTP_USER" ]; then
    railway variables set EMAIL_PROVIDER=smtp
    railway variables set SMTP_HOST="$SMTP_HOST"
    railway variables set SMTP_PORT="$SMTP_PORT"
    railway variables set SMTP_USER="$SMTP_USER"
    railway variables set SMTP_PASS="$SMTP_PASS"
    railway variables set SMTP_SECURE=false
fi

echo ""
echo -e "${GREEN}✅ Environment variables set${NC}"
echo ""

# Deploy
echo "🚀 Deploying to Railway..."
railway up

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""

# Get deployment URL
echo "📊 Deployment Info:"
railway status
echo ""

# Run migrations
echo "🔄 Running database migrations..."
railway run npx prisma migrate deploy
echo ""

# Optional: Seed database
echo "🌱 Seed database with demo data?"
read -p "Seed database? (y/n): " SEED
if [ "$SEED" = "y" ]; then
    railway run npx prisma db seed
    echo -e "${GREEN}✅ Database seeded${NC}"
fi

echo ""
echo "🎉 DEPLOYMENT COMPLETE!"
echo ""
echo "Next steps:"
echo "1. Get your deployment URL: railway status"
echo "2. Set FRONTEND_URL in environment variables"
echo "3. Deploy frontend to Vercel"
echo "4. Update CORS_ORIGIN with your frontend URL"
echo ""
echo "Demo credentials (if seeded):"
echo "  Email: admin@demo.practice"
echo "  Password: DemoPass123!"
echo ""
