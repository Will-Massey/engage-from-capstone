#!/bin/bash

# Engage by Capstone - Restore Script
# Run this script after restarting your PC to get back to the current state
# Last updated: 2026-04-09

set -e  # Exit on error

echo "====================================="
echo "Engage Restore Script"
echo "====================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    print_error "Please run this script from the engage project root directory"
    print_error "Expected: /Users/capstone/Desktop/engage"
    exit 1
fi

print_status "Found engage project directory"

# ============================================
# STEP 1: Check Git Status
# ============================================
echo ""
echo "====================================="
echo "Step 1: Checking Git Repository"
echo "====================================="

if [ -d ".git" ]; then
    print_status "Git repository found"
    
    # Check current branch
    BRANCH=$(git branch --show-current)
    print_status "Current branch: $BRANCH"
    
    # Pull latest changes
    echo "Pulling latest changes from origin..."
    git pull origin $BRANCH || print_warning "Could not pull latest changes"
    
    # Show last 3 commits
    echo ""
    echo "Recent commits:"
    git log --oneline -3
else
    print_error "Not a git repository!"
    exit 1
fi

# ============================================
# STEP 2: Install Dependencies
# ============================================
echo ""
echo "====================================="
echo "Step 2: Installing Dependencies"
echo "====================================="

# Check for Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js not found! Please install Node.js 20+ first."
    print_error "Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version)
print_status "Node.js version: $NODE_VERSION"

# Install root dependencies
print_status "Installing root dependencies..."
npm install

# Install backend dependencies
print_status "Installing backend dependencies..."
cd backend
npm install

# Generate Prisma client
print_status "Generating Prisma client..."
npx prisma generate

cd ..

# Install frontend dependencies
print_status "Installing frontend dependencies..."
cd frontend
npm install

cd ..

print_status "All dependencies installed"

# ============================================
# STEP 3: Database Setup (Optional)
# ============================================
echo ""
echo "====================================="
echo "Step 3: Database Setup"
echo "====================================="

print_warning "Database URL must be set in environment variables"
print_warning "Current DATABASE_URL: ${DATABASE_URL:-"Not set"}"

if [ -n "$DATABASE_URL" ]; then
    echo ""
    read -p "Run database migrations? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd backend
        print_status "Running database migrations..."
        npx prisma migrate deploy
        cd ..
        print_status "Database migrations complete"
    else
        print_warning "Skipping database migrations"
    fi
else
    print_warning "Skipping database setup (DATABASE_URL not set)"
    print_warning "Set DATABASE_URL and run: cd backend && npx prisma migrate deploy"
fi

# ============================================
# STEP 4: Build Frontend
# ============================================
echo ""
echo "====================================="
echo "Step 4: Building Frontend"
echo "====================================="

print_status "Building frontend..."
cd frontend
npm run build

cd ..

# Copy dist to backend public
print_status "Copying frontend build to backend..."
cp -r frontend/dist/* backend/public/ || print_warning "Could not copy dist files"

print_status "Frontend build complete"

# ============================================
# STEP 5: Environment Variables Check
# ============================================
echo ""
echo "====================================="
echo "Step 5: Environment Variables"
echo "====================================="

print_warning "Make sure these environment variables are set in Render:"
echo ""
echo "REQUIRED:"
echo "  - DATABASE_URL"
echo "  - JWT_SECRET"
echo "  - FRONTEND_URL"
echo ""
echo "RECOMMENDED:"
echo "  - COMPANIES_HOUSE_API_KEY"
echo "  - EMAIL_PROVIDER + SMTP settings"
echo "  - ADFIN_API_KEY (if using Adfin payments)"
echo ""

# Check if .env file exists
if [ -f "backend/.env" ]; then
    print_status "Found backend/.env file"
else
    print_warning "No backend/.env file found"
    print_warning "Create one with: cp backend/.env.example backend/.env"
fi

# ============================================
# STEP 6: Git Status
# ============================================
echo ""
echo "====================================="
echo "Step 6: Git Status"
echo "====================================="

git status

# ============================================
# STEP 7: Summary
# ============================================
echo ""
echo "====================================="
echo "Restore Complete!"
echo "====================================="
echo ""
print_status "Project restored successfully"
echo ""
echo "Next steps:"
echo ""
echo "1. Set environment variables in Render dashboard:"
echo "   https://dashboard.render.com"
echo ""
echo "2. Start development servers:"
echo "   Terminal 1: npm run dev:backend"
echo "   Terminal 2: npm run dev:frontend"
echo ""
echo "3. Or deploy to production:"
echo "   git push origin master"
echo ""
echo "Current project state:"
git log --oneline -1
echo ""
echo "====================================="
