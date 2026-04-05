#!/bin/bash
# =============================================================================
# Database Migration Script
# =============================================================================

set -e

ENVIRONMENT=${1:-development}
ACTION=${2:-migrate}

log_info() { echo -e "\033[0;32m[INFO]\033[0m $1"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; }

# Load environment
if [ -f ".env.${ENVIRONMENT}" ]; then
    export $(grep -v '^#' .env.${ENVIRONMENT} | xargs)
elif [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
fi

cd backend

case $ACTION in
    migrate)
        log_info "Running migrations..."
        pnpm prisma migrate deploy
        ;;
    status)
        log_info "Migration status..."
        pnpm prisma migrate status
        ;;
    reset)
        log_info "Resetting database..."
        pnpm prisma migrate reset --force
        ;;
    create)
        NAME=$3
        if [ -z "$NAME" ]; then
            log_error "Migration name required"
            exit 1
        fi
        log_info "Creating migration: $NAME"
        pnpm prisma migrate dev --name "$NAME"
        ;;
    *)
        log_error "Unknown action: $ACTION"
        echo "Usage: $0 [environment] [migrate|status|reset|create]"
        exit 1
        ;;
esac

log_info "Done!"
