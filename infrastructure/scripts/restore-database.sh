#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path_to_backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup archive '${BACKUP_FILE}' not found."
  exit 1
fi

# Verify checksum if present
if [ -f "${CHECKSUM_FILE}" ]; then
  echo "Verifying archive integrity with SHA256 checksum..."
  EXPECTED_CHECKSUM=$(cat "${CHECKSUM_FILE}")
  ACTUAL_CHECKSUM=$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')

  if [ "${EXPECTED_CHECKSUM}" != "${ACTUAL_CHECKSUM}" ]; then
    echo "Error: Checksum mismatch! Archive may be corrupted or tampered."
    echo "Expected: ${EXPECTED_CHECKSUM}"
    echo "Actual:   ${ACTUAL_CHECKSUM}"
    exit 1
  fi
  echo "Checksum verified successfully."
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-nyx_user}"
DB_NAME="${DB_NAME:-nyx_dev}"

echo "Restoring database ${DB_NAME} from ${BACKUP_FILE}..."

PGPASSWORD="${DB_PASSWORD:-nyx_password}" gunzip -c "${BACKUP_FILE}" | psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --single-transaction \
  --variable ON_ERROR_STOP=1

echo "Database restoration completed successfully."
