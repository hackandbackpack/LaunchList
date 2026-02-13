#!/bin/sh
# ListPull Database Backup Script
# Usage: docker exec listpull /app/scripts/backup.sh

BACKUP_DIR="/app/data/backups"
DB_PATH="/app/data/listpull.db"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

# Use SQLite .backup for a consistent copy
BACKUP_FILE="$BACKUP_DIR/listpull-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [ $? -eq 0 ]; then
  echo "Backup created: $BACKUP_FILE"
else
  echo "ERROR: Backup failed" >&2
  exit 1
fi

# Remove backups older than retention period
find "$BACKUP_DIR" -name "listpull-*.db" -mtime +$RETENTION_DAYS -delete
echo "Cleaned up backups older than $RETENTION_DAYS days"
