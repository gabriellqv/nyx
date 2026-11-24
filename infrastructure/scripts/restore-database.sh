#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path_to_backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
CHECKSUM_FILE="${BACKUP_FILE}.sha256"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-nyx_user}"
DB_NAME="${DB_NAME:-nyx_dev}"
: "${DB_PASSWORD:?DB_PASSWORD must be provided through a secret or local environment}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup archive '${BACKUP_FILE}' not found."
  exit 1
fi

if [ ! -f "${CHECKSUM_FILE}" ]; then
  echo "Error: Required checksum file '${CHECKSUM_FILE}' not found."
  exit 1
fi

echo "Verifying archive integrity with SHA256 checksum..."
EXPECTED_CHECKSUM=$(cat "${CHECKSUM_FILE}")
if [[ ! "${EXPECTED_CHECKSUM}" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo "Error: Checksum file contains an invalid SHA256 value."
  exit 1
fi
ACTUAL_CHECKSUM=$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')
if [ "${EXPECTED_CHECKSUM}" != "${ACTUAL_CHECKSUM}" ]; then
  echo "Error: Checksum mismatch. Archive may be corrupted or tampered."
  exit 1
fi
gzip -t "${BACKUP_FILE}"
echo "Checksum verified successfully."

echo "Restoring database ${DB_NAME} from ${BACKUP_FILE}..."

gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --single-transaction \
  --variable ON_ERROR_STOP=1

echo "Database restoration completed successfully."
