#!/bin/bash
# Script to resolve failed migrations on Render
# Run this after deploying the fix

echo "🔧 Resolving failed migrations..."

cd /opt/render/project/src/backend

# Mark the failed migration as rolled back
echo "Marking failed migration as rolled back..."
npx prisma migrate resolve --rolled-back "20260410_data_migration_v2_pricing"

# Deploy migrations to add the billingCycle column
echo "Deploying migrations..."
npx prisma migrate deploy

echo "✅ Migration resolution complete!"
