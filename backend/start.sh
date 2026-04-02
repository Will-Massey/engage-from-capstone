#!/bin/sh
# Start script for Render - runs migrations then starts server

echo "🗄️  Running database migrations..."
npx prisma migrate deploy

echo "🚀 Starting server..."
node dist/index.js
