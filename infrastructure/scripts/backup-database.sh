#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-nyx_user}"
DB_NAME="${DB_NAME:-nyx_dev}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
: "${DB_PASSWORD:?DB_PASSWORD must be provided through a secret or local environment}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

umask 077
mkdir -p "${BACKUP_DIR}"
TEMP_BACKUP=$(mktemp "${BACKUP_DIR}/.${DB_NAME}_${TIMESTAMP}.XXXXXX")
TEMP_CHECKSUM=$(mktemp "${BACKUP_DIR}/.${DB_NAME}_${TIMESTAMP}.XXXXXX")
cleanup() {
  rm -f "${TEMP_BACKUP}" "${TEMP_CHECKSUM}"
}
trap cleanup EXIT

echo "Starting database backup for ${DB_NAME} at ${DB_HOST}:${DB_PORT}..."

PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip > "${TEMP_BACKUP}"

gzip -t "${TEMP_BACKUP}"
mv "${TEMP_BACKUP}" "${BACKUP_FILE}"

sha256sum "${BACKUP_FILE}" | awk '{print $1}' > "${TEMP_CHECKSUM}"
mv "${TEMP_CHECKSUM}" "${CHECKSUM_FILE}"
trap - EXIT

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
CHECKSUM=$(cat "${CHECKSUM_FILE}")

echo "Database backup completed successfully."
echo "Archive: ${BACKUP_FILE} (${FILE_SIZE})"
echo "SHA256:  ${CHECKSUM}"
