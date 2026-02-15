#!/bin/sh
# LaunchList Database Backup Script
# Usage: docker exec LaunchList /app/scripts/backup.sh

BACKUP_DIR="/app/data/backups"
DB_PATH="/app/data/LaunchList.db"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

# Use SQLite .backup for a consistent copy
BACKUP_FILE="$BACKUP_DIR/LaunchList-$(date +%Y%m%d-%H%M%S).db"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [ $? -eq 0 ]; then
  echo "Backup created: $BACKUP_FILE"
else
  echo "ERROR: Backup failed" >&2
  exit 1
fi

# Remove backups older than retention period
find "$BACKUP_DIR" -name "LaunchList-*.db" -mtime +$RETENTION_DAYS -delete
echo "Cleaned up backups older than $RETENTION_DAYS days"
