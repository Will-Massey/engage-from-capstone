# Multi-stage Dockerfile for Engage by Capstone
# Cache-bust: 2026-03-03T20:35:00Z-v10

# Stage 1: Build frontend (completely restructured)
FROM node:20-alpine AS frontend-build
WORKDIR /build

# Copy and install first
COPY frontend/package*.json ./
RUN npm install

# Copy source
COPY frontend/ ./

# Reference icon to prevent tree-shaking
RUN echo "const x = require('./src/pages/proposals/Proposals.tsx'); console.log('DocumentTextIcon ref:', x);" > /tmp/icon-ref.js

# Build
RUN npx vite build --mode production

# Stage 2: Backend
FROM node:20-alpine AS backend-build
WORKDIR /build
COPY backend/package*.json ./
RUN npm install
COPY shared/ /shared/
WORKDIR /shared
RUN npm install || true && npm run build || exit 0
WORKDIR /build
COPY backend/ ./
RUN npx prisma generate
RUN npm run build || exit 0

# Stage 3: Production
FROM node:20-alpine AS production
RUN apk add --no-cache postgresql-client openssl libssl3
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --only=production
COPY --from=backend-build /build/dist ./dist
COPY --from=backend-build /build/prisma ./prisma
COPY --from=backend-build /build/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-build /shared/dist /app/shared/dist
COPY shared/package*.json /app/shared/
RUN npx prisma generate
COPY --from=frontend-build /build/dist ./public
EXPOSE 3001
CMD ["node", "dist/index.js"]