#!/usr/bin/env bash
set -euo pipefail

# Configuration with defaults
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-nyx_user}"
DB_NAME="${DB_NAME:-nyx_dev}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

mkdir -p "${BACKUP_DIR}"

echo "Starting automated database backup for ${DB_NAME} at ${DB_HOST}:${DB_PORT}..."

# Execute pg_dump with gzip compression
PGPASSWORD="${DB_PASSWORD:-nyx_password}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip > "${BACKUP_FILE}"

# Generate cryptographic checksum for integrity verification
sha256sum "${BACKUP_FILE}" | awk '{print $1}' > "${CHECKSUM_FILE}"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
CHECKSUM=$(cat "${CHECKSUM_FILE}")

echo "Database backup completed successfully."
echo "Archive: ${BACKUP_FILE} (${FILE_SIZE})"
echo "SHA256:  ${CHECKSUM}"
