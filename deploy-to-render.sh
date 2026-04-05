#!/bin/bash

# Engage - Deploy to Render Script
# Run this script to push code and deploy to Render

set -e

echo "🚀 Engage Deployment Script"
echo "============================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "render.yaml" ]; then
    echo -e "${RED}Error: render.yaml not found. Are you in the engage directory?${NC}"
    exit 1
fi

echo -e "${BLUE}Step 1: Checking git status...${NC}"
git status --short

echo ""
echo -e "${BLUE}Step 2: Adding all changes...${NC}"
git add -A

echo ""
echo -e "${BLUE}Step 3: Committing changes...${NC}"
git commit -m "fix: Finalize app - real dashboard data, service detail page, cover letter flow

Changes made:
- Added dashboard stats API endpoint with real data
- Replaced mock chart data with live API integration
- Completely rebuilt Service Detail page with full functionality
- Verified cover letter flow working correctly
- Updated API client with getDashboardStats method

Ready for production deployment."

echo ""
echo -e "${BLUE}Step 4: Pushing to GitHub...${NC}"
git push origin master

echo ""
echo -e "${GREEN}✅ Code pushed to GitHub!${NC}"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Go to Render Dashboard:"
echo "   https://dashboard.render.com"
echo ""
echo "2. Click 'New' → 'Blueprint'"
echo "   OR use the quick deploy button:"
echo "   https://dashboard.render.com/select-repo?type=blueprint"
echo ""
echo "3. Select your repository: Will-Massey/engage-from-capstone"
echo ""
echo "4. Render will automatically:"
echo "   • Create PostgreSQL database"
echo "   • Deploy backend API"
echo "   • Deploy frontend static site"
echo "   • Configure environment variables"
echo ""
echo "5. After deployment, set these environment variables in Render Dashboard:"
echo ""
echo "   Backend (engage-backend):"
echo "   - JWT_SECRET: $(openssl rand -base64 32 2>/dev/null || echo 'Generate with: openssl rand -base64 32')"
echo "   - SMTP_USER: william@capstonesoftware.co.uk"
echo "   - SMTP_PASS: [your SMTP password]"
echo "   - COMPANIES_HOUSE_API_KEY: [your API key]"
echo "   - STRIPE_SECRET_KEY: [your Stripe key]"
echo ""
echo "6. Run database migrations:"
echo "   Go to engage-backend → Shell → Run: npx prisma migrate deploy"
echo ""
echo "7. Your app will be live at:"
echo "   Frontend: https://engage-frontend-xxx.onrender.com"
echo "   Backend:  https://engage-backend-xxx.onrender.com"
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  Warning: There are uncommitted changes${NC}"
    git status --short
fi

echo ""
echo -e "${GREEN}🎉 Deployment preparation complete!${NC}"
