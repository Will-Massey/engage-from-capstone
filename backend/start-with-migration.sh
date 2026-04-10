#!/bin/bash
set -e

echo "🚀 Starting Engage Backend..."

# Run database migrations
echo "📊 Running database migrations..."
npx prisma migrate deploy

# Seed database if needed (optional)
# echo "🌱 Seeding database..."
# npx prisma db seed

# Start the application
echo "✅ Starting application..."
node dist/index.js
