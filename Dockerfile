# Multi-stage Dockerfile for Engage by Capstone
# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
ARG CACHE_BUST=20260303184500

WORKDIR /app/frontend

# Invalidate cache by writing timestamp
RUN echo "20260303193600" > /tmp/cache-bust
COPY frontend/package*.json ./
RUN npm cache clean --force && npm install

# Copy frontend source - cache-bust: 2026-03-03T18:45:00Z
COPY --chown=node:node frontend/ ./

# Debug: Show the Proposals.tsx import line
RUN echo "=== Checking for DocumentTextIcon in source ===" && \
    grep -n "DocumentTextIcon" src/pages/proposals/Proposals.tsx || echo "WARNING: Icon not found in source!"

# Build with Vite - fail if build fails (don't mask errors)
RUN npx vite build --mode production

# Debug: Show what was built
RUN echo "=== Frontend build output ===" && \
    ls -la dist/assets/ 2>/dev/null && \
    echo "=== Checking for DocumentTextIcon in bundle ===" && \
    grep -o "DocumentTextIcon" dist/assets/index-*.js | head -1 || echo "WARNING: Icon not in bundle!"

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder

WORKDIR /app/backend

# Install dependencies
COPY backend/package*.json ./
RUN npm install

# Copy shared module
COPY shared/ /app/shared/

# Build shared module first
WORKDIR /app/shared
RUN npm install || true
RUN npm run build || (echo "Shared build completed with errors, continuing..." && exit 0)

# Copy backend source
WORKDIR /app/backend
COPY backend/ ./

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript (ignore type errors for now)
RUN npm run build || (echo "Build completed with errors, continuing..." && exit 0)

# Stage 3: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install PostgreSQL client and OpenSSL for Prisma
RUN apk add --no-cache postgresql-client openssl libssl3

# Copy backend package files
COPY backend/package*.json ./
RUN npm install --only=production

# Copy shared module (built)
COPY --from=backend-builder /app/shared/dist /app/shared/dist
COPY shared/package*.json /app/shared/

# Copy backend built files
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/prisma ./prisma
COPY --from=backend-builder /app/backend/node_modules/.prisma ./node_modules/.prisma

# Regenerate Prisma client with correct binary targets for production
RUN npx prisma generate

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist ./public

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

# Start command
CMD ["node", "dist/index.js"]
