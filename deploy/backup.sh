#!/usr/bin/env bash
# Günlük veritabanı yedeği. Son 14 gün saklanır.
# Cron: 0 4 * * * /opt/byslab/deploy/backup.sh >> /var/log/byslab-backup.log 2>&1
set -euo pipefail

DIR=/opt/byslab/backups
mkdir -p "$DIR"

STAMP=$(date +%Y-%m-%d-%H%M)
cd /opt/byslab/deploy

docker compose exec -T db pg_dump -U bytepanel -d bytepanel -Fc > "$DIR/bytepanel-$STAMP.dump"
find "$DIR" -name 'bytepanel-*.dump' -mtime +14 -delete

echo "$(date '+%F %T') yedek alındı: bytepanel-$STAMP.dump ($(du -h "$DIR/bytepanel-$STAMP.dump" | cut -f1))"
