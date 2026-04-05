#!/bin/bash
# =============================================================================
# Database Backup Script
# =============================================================================
# Usage: ./db-backup.sh [environment]
# Environments: development, staging, production
# =============================================================================

set -e

ENVIRONMENT=${1:-development}
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="engage_${ENVIRONMENT}_${TIMESTAMP}.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Load Environment Variables
# =============================================================================
load_env() {
    if [ -f ".env.${ENVIRONMENT}" ]; then
        log_info "Loading environment from .env.${ENVIRONMENT}"
        export $(grep -v '^#' .env.${ENVIRONMENT} | xargs)
    elif [ -f ".env" ]; then
        log_info "Loading environment from .env"
        export $(grep -v '^#' .env | xargs)
    else
        log_error "No environment file found"
        exit 1
    fi
}

# =============================================================================
# Create Backup Directory
# =============================================================================
mkdir -p "${BACKUP_DIR}"

# =============================================================================
# Perform Backup
# =============================================================================
perform_backup() {
    log_info "Starting backup for ${ENVIRONMENT} environment..."
    
    if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL is not set"
        exit 1
    fi
    
    # Parse DATABASE_URL
    DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
    DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
    DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
    
    # Create backup
    PGPASSWORD="${DB_PASS}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --verbose \
        --no-owner \
        --no-acl \
        --format=plain \
        > "${BACKUP_DIR}/${BACKUP_FILE}"
    
    # Compress backup
    gzip "${BACKUP_DIR}/${BACKUP_FILE}"
    
    log_info "Backup completed: ${BACKUP_FILE}.gz"
    
    # Upload to S3 if configured
    if [ -n "$AWS_S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
        log_info "Uploading to S3..."
        aws s3 cp "${BACKUP_DIR}/${BACKUP_FILE}.gz" "s3://${AWS_S3_BUCKET}/backups/${ENVIRONMENT}/"
        log_info "Upload completed"
    fi
}

# =============================================================================
# Cleanup Old Backups
# =============================================================================
cleanup_old_backups() {
    log_info "Cleaning up old backups (keeping last 30 days)..."
    
    # Local cleanup
    find "${BACKUP_DIR}" -name "engage_${ENVIRONMENT}_*.sql.gz" -mtime +30 -delete
    
    # S3 cleanup
    if [ -n "$AWS_S3_BUCKET" ] && [ -n "$AWS_ACCESS_KEY_ID" ]; then
        aws s3 ls "s3://${AWS_S3_BUCKET}/backups/${ENVIRONMENT}/" | \
            awk '{print $4}' | \
            while read file; do
                aws s3 rm "s3://${AWS_S3_BUCKET}/backups/${ENVIRONMENT}/${file}"
            done
    fi
    
    log_info "Cleanup completed"
}

# =============================================================================
# Main Execution
# =============================================================================
main() {
    log_info "Database Backup Script - Environment: ${ENVIRONMENT}"
    
    load_env
    perform_backup
    cleanup_old_backups
    
    log_info "Backup process completed successfully!"
}

main "$@"
