#!/usr/bin/env bash
# Sunucuda güncelleme: kod çekilir, bağımlılıklar kurulur, servisler yenilenir.
# Kullanım (VPS'te):  /opt/byslab/deploy/update.sh
set -euo pipefail

cd /opt/byslab

echo "→ Kod güncelleniyor"
git pull --ff-only

cd /opt/byslab/deploy

echo "→ Eski önbellek temizliği"
# Yerelden gelen bootstrap/cache dosyaları geliştirme paketlerine atıf yapabiliyor
rm -f /opt/byslab/backend/bootstrap/cache/*.php
chown -R 82:82 /opt/byslab/backend/bootstrap/cache /opt/byslab/backend/storage
chown 82:82 /opt/byslab/backend/.env

echo "→ PHP bağımlılıkları"
docker compose run --rm --no-deps app composer install --no-dev --optimize-autoloader --no-interaction

echo "→ Veritabanı"
docker compose run --rm app php artisan migrate --force

echo "→ Laravel önbelleği"
docker compose run --rm app php artisan config:cache
docker compose run --rm app php artisan route:cache

echo "→ Arayüz derlemesi"
docker compose run --rm --no-deps -e NODE_ENV=development frontend npm ci --no-audit --no-fund
docker compose run --rm --no-deps -e NODE_OPTIONS=--max-old-space-size=2560 frontend npm run build

echo "→ Servisler yeniden başlatılıyor"
docker compose up -d
docker compose restart app scheduler queue frontend

docker compose ps
echo "✓ Güncelleme tamam: https://panel.smsbenden.com"
