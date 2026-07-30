#!/bin/sh
# Dump database ra file .sql.gz rồi đẩy lên Cloudflare R2, và xoá bản cũ hơn
# RETENTION_DAYS ngày.
#
# Chạy tự động hằng ngày qua .github/workflows/backup-db.yml, hoặc chạy tay:
#   DATABASE_URL=... R2_ENDPOINT=... R2_ACCESS_KEY=... R2_SECRET_KEY=... \
#     sh scripts/backup-db.sh production
#
# Yêu cầu: pg_dump (>= major version của server, xem ghi chú dưới), aws CLI, gzip.
#
# ⚠️ DATABASE_URL phải là DATABASE_PUBLIC_URL của Railway. Bản nội bộ trỏ
# *.railway.internal chỉ resolve được bên trong mạng Railway nên chạy từ GitHub
# Actions hay từ máy mình đều không tới được.

set -eu

ENV_NAME="${1:-production}"

DATABASE_URL="${DATABASE_URL:?Set DATABASE_URL (dùng DATABASE_PUBLIC_URL của Railway)}"
R2_ENDPOINT="${R2_ENDPOINT:?Set R2_ENDPOINT}"
R2_ACCESS_KEY="${R2_ACCESS_KEY:?Set R2_ACCESS_KEY}"
R2_SECRET_KEY="${R2_SECRET_KEY:?Set R2_SECRET_KEY}"
R2_BUCKET="${R2_BUCKET:-cafe-music-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# Ngưỡng "dump rỗng": schema của app một mình đã lớn hơn nhiều lần con số này.
# Backup lỗi âm thầm là cái bẫy kinh điển — thà fail để job đỏ và có mail.
MIN_BYTES="${MIN_BYTES:-2048}"

stamp=$(date -u +%Y%m%d-%H%M)
file="cafe-music-${ENV_NAME}-${stamp}.sql.gz"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY"
export AWS_DEFAULT_REGION=auto

echo "== Dump $ENV_NAME → $file =="
pg_dump --no-owner --no-acl "$DATABASE_URL" | gzip -9 >"$file"

size=$(wc -c <"$file" | tr -d ' ')
echo "   kích thước: $size bytes"
if [ "$size" -lt "$MIN_BYTES" ]; then
  echo "DỪNG: dump chỉ $size bytes (< $MIN_BYTES) — gần như chắc chắn là dump hỏng." >&2
  exit 1
fi

echo "== Upload lên r2://$R2_BUCKET/$file =="
aws s3 cp "$file" "s3://$R2_BUCKET/$file" --endpoint-url "$R2_ENDPOINT"

echo "== Dọn bản cũ hơn $RETENTION_DAYS ngày =="
# `date -d` là GNU date (có trên ubuntu-latest của Actions và trong Git Bash).
cutoff=$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%d)
aws s3 ls "s3://$R2_BUCKET/" --endpoint-url "$R2_ENDPOINT" | awk '{print $4}' |
  while IFS= read -r object; do
    [ -n "$object" ] || continue
    # cafe-music-<env>-YYYYMMDD-HHMM.sql.gz → lấy phần YYYYMMDD
    object_date=$(printf '%s' "$object" | sed -n 's/.*-\([0-9]\{8\}\)-[0-9]\{4\}\.sql\.gz$/\1/p')
    [ -n "$object_date" ] || continue
    if [ "$object_date" -lt "$cutoff" ]; then
      echo "   xoá $object"
      aws s3 rm "s3://$R2_BUCKET/$object" --endpoint-url "$R2_ENDPOINT"
    fi
  done

rm -f "$file"
echo "== Xong: $file =="
