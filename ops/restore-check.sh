#!/usr/bin/env bash
# The quarterly restore test (plan B12-08). Restores the newest database dump
# from ops/backup.sh into a throwaway PostgreSQL with no network, compares row
# counts with the live database, and checks the newest files archive holds an
# object for every attachment the restored database names. Exits non-zero if
# the restore fails or an object is missing; the container is always removed.
#
# Restoring for real: pg_restore the dump into a fresh database, and with MinIO
# stopped extract the archive into its empty volume (same MinIO release).
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
PG_CONTAINER="${PG_CONTAINER:-todo-app-postgres-1}"
PG_DATABASE="${PG_DATABASE:-todo_app}"
BUCKET="${BUCKET:-todo-attachments}"
read -r -a DOCKER <<< "${DOCKER:-sudo -n docker}"

db=$(ls -t "$BACKUP_DIR"/veylo-db-*.dump | head -1)
files=$(ls -t "$BACKUP_DIR"/veylo-files-*.tar.gz | head -1)
check="veylo-restore-check-$$"

trap '"${DOCKER[@]}" rm -f -v "$check" > /dev/null 2>&1 || true' EXIT

echo "restoring $(basename "$db") and checking $(basename "$files")"

"${DOCKER[@]}" run -d --name "$check" --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:18 > /dev/null

until "${DOCKER[@]}" exec "$check" pg_isready -U postgres > /dev/null 2>&1; do sleep 1; done

"${DOCKER[@]}" exec "$check" createdb -U postgres restored
"${DOCKER[@]}" exec -i "$check" pg_restore -U postgres -d restored --no-owner --exit-on-error < "$db"

for table in users boards todos comments attachments; do
  live=$("${DOCKER[@]}" exec "$PG_CONTAINER" psql -U postgres -d "$PG_DATABASE" -Atc "select count(*) from $table")
  restored=$("${DOCKER[@]}" exec "$check" psql -U postgres -d restored -Atc "select count(*) from $table")
  echo "$table: live $live, restored $restored"
done

# MinIO keeps each object as a directory holding xl.meta.
missing=$(comm -23 \
  <("${DOCKER[@]}" exec "$check" psql -U postgres -d restored -Atc "select storage_path from attachments" | sort) \
  <(tar -tzf "$files" | sed -n "s|^\./$BUCKET/\(.*\)/xl\.meta$|\1|p" | sort))

if [ -n "$missing" ]; then
  echo "attachments with no object in the archive:"
  echo "$missing"
  exit 1
fi

echo "ok: every attachment row has its object"
