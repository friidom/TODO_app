#!/usr/bin/env bash
# Backs up both of Veylo's stores on the Docker host: the database (pg_dump,
# custom format) and the MinIO volume, which holds every attachment and avatar
# and is not in the dump. Keeps RETENTION_DAYS of each. Nightly from cron:
#
#   15 3 * * * /home/ubuntu/veylo/ops/backup.sh >> /home/ubuntu/backups/backup.log 2>&1
#
# Copies on this machine die with it: pull them off weekly, e.g. from your own
# machine:  rsync -a -e "ssh -i <key>" ubuntu@<host>:backups/ ~/veylo-backups/
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
PG_CONTAINER="${PG_CONTAINER:-todo-app-postgres-1}"
PG_DATABASE="${PG_DATABASE:-todo_app}"
MINIO_VOLUME="${MINIO_VOLUME:-todo-app_minio_data}"
read -r -a DOCKER <<< "${DOCKER:-sudo -n docker}"

stamp=$(date -u +%Y%m%d-%H%M%S)
db="$BACKUP_DIR/veylo-db-$stamp.dump"
files="$BACKUP_DIR/veylo-files-$stamp.tar.gz"

mkdir -p "$BACKUP_DIR"

# Written as .partial and renamed only once read back, so a failed run never
# leaves a file that looks like a good backup.
"${DOCKER[@]}" exec "$PG_CONTAINER" pg_dump -U postgres -Fc "$PG_DATABASE" > "$db.partial"
"${DOCKER[@]}" exec -i "$PG_CONTAINER" pg_restore -l < "$db.partial" > /dev/null
mv "$db.partial" "$db"

# Attachments are written once and never edited, so a copy of the live volume
# is consistent enough without stopping MinIO.
"${DOCKER[@]}" run --rm -v "$MINIO_VOLUME:/data:ro" alpine:3 tar -czf - -C /data . > "$files.partial"
tar -tzf "$files.partial" > /dev/null
mv "$files.partial" "$files"

# Only this script's own files; the pre-deploy dumps beside them are kept.
find "$BACKUP_DIR" -maxdepth 1 -name 'veylo-*' -mtime "+$RETENTION_DAYS" -delete

echo "$(date -u +%FT%TZ) ok $(du -h "$db" | cut -f1) $(basename "$db"), $(du -h "$files" | cut -f1) $(basename "$files")"
