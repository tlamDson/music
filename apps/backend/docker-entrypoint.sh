#!/bin/sh
set -e

cd /app/apps/backend

# Áp migration trước khi mở cổng: container mới mà schema chưa có thì app
# sẽ chết ngay ở query đầu tiên. Lệnh này idempotent, deploy lại không sao.
echo "[entrypoint] Applying database migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] Starting backend..."
exec node dist/main
