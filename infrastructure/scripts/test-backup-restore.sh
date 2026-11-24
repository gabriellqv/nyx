#!/usr/bin/env bash
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-nyx_user}"
DB_NAME="${DB_NAME:-nyx_test}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"

RESTORE_DB_NAME="nyx_restore_check_${RANDOM}_${RANDOM}"
BACKUP_DIR=$(mktemp -d)

cleanup() {
  if command -v dropdb >/dev/null 2>&1; then
    PGPASSWORD="${DB_PASSWORD}" dropdb \
      -h "${DB_HOST}" \
      -p "${DB_PORT}" \
      -U "${DB_USER}" \
      --if-exists "${RESTORE_DB_NAME}" || true
  fi
  rm -rf "${BACKUP_DIR}"
}
trap cleanup EXIT

source_migration_count=$(PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-psqlrc \
  --tuples-only \
  --no-align \
  --variable ON_ERROR_STOP=1 \
  --command 'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')

if [ "${source_migration_count}" -eq 0 ]; then
  echo "Source database has no applied Prisma migrations to verify."
  exit 1
fi

DB_HOST="${DB_HOST}" \
DB_PORT="${DB_PORT}" \
DB_USER="${DB_USER}" \
DB_PASSWORD="${DB_PASSWORD}" \
DB_NAME="${DB_NAME}" \
BACKUP_DIR="${BACKUP_DIR}" \
  "$(dirname "$0")/backup-database.sh"

BACKUP_FILE=$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.sql.gz' -print -quit)
if [ -z "${BACKUP_FILE}" ]; then
  echo "Backup script did not produce a dump archive."
  exit 1
fi

PGPASSWORD="${DB_PASSWORD}" createdb \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  "${RESTORE_DB_NAME}"

DB_HOST="${DB_HOST}" \
DB_PORT="${DB_PORT}" \
DB_USER="${DB_USER}" \
DB_PASSWORD="${DB_PASSWORD}" \
DB_NAME="${RESTORE_DB_NAME}" \
  "$(dirname "$0")/restore-database.sh" "${BACKUP_FILE}"

restored_migration_count=$(PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${RESTORE_DB_NAME}" \
  --no-psqlrc \
  --tuples-only \
  --no-align \
  --variable ON_ERROR_STOP=1 \
  --command 'SELECT COUNT(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')

if [ "${source_migration_count}" != "${restored_migration_count}" ]; then
  echo "Restored database migration count does not match the source."
  exit 1
fi

CORRUPTED_BACKUP="${BACKUP_DIR}/corrupted.sql.gz"
cp "${BACKUP_FILE}" "${CORRUPTED_BACKUP}"
cp "${BACKUP_FILE}.sha256" "${CORRUPTED_BACKUP}.sha256"
printf 'corruption' >> "${CORRUPTED_BACKUP}"

if DB_HOST="${DB_HOST}" \
  DB_PORT="${DB_PORT}" \
  DB_USER="${DB_USER}" \
  DB_PASSWORD="${DB_PASSWORD}" \
  DB_NAME="${RESTORE_DB_NAME}" \
    "$(dirname "$0")/restore-database.sh" "${CORRUPTED_BACKUP}"; then
  echo "Restore unexpectedly accepted an archive with a mismatched checksum."
  exit 1
fi

echo "Backup, checksum verification, and restore smoke test passed."
