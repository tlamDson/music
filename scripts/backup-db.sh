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

# Chuẩn hoá endpoint TRƯỚC khi dump. `aws` báo đúng một câu "Invalid endpoint:
# <giá trị>" cho mọi lỗi định dạng, mà trong GitHub Actions giá trị đó bị mask
# thành *** nên không đoán được sai chỗ nào — và nó chỉ nổ SAU khi đã dump xong.
# Hai lỗi vô hại dưới đây tự sửa được; lỗi thừa path bucket thì báo rõ ràng.
R2_ENDPOINT=$(printf '%s' "$R2_ENDPOINT" | tr -d '\r\n' |
  sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s#/*$##')

case "$R2_ENDPOINT" in
  http://* | https://*) ;;
  # Dán từ dashboard Cloudflare rất dễ mất phần scheme.
  *) R2_ENDPOINT="https://$R2_ENDPOINT" ;;
esac

# Phần sau host phải rỗng: tên bucket đã nằm ở R2_BUCKET, thêm vào endpoint nữa
# thì đường dẫn thành .../<bucket>/<bucket>/<file>.
endpoint_path=$(printf '%s' "$R2_ENDPOINT" | sed 's#^https\?://[^/]*##')
if [ -n "$endpoint_path" ]; then
  echo "DỪNG: R2_ENDPOINT không được chứa đường dẫn ('$endpoint_path')." >&2
  echo "Chỉ dùng phần scheme + host, ví dụ: https://<account-id>.r2.cloudflarestorage.com" >&2
  echo "Tên bucket đặt riêng ở R2_BUCKET (hiện tại: $R2_BUCKET)." >&2
  exit 1
fi

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
# Tính mốc bằng epoch rồi mới format. `date -d "-30 days"` là cú pháp riêng của
# GNU date và BusyBox (Alpine — chính là image workflow chạy) từ chối thẳng:
# "date: invalid date '-30 days'". Với `set -e`, lỗi trong command substitution
# làm script thoát ngay SAU khi đã upload xong, nên job đỏ mỗi đêm dù backup vẫn
# lên bucket. Dạng `-d @<epoch>` chạy được trên cả BusyBox lẫn GNU.
cutoff=$(date -u -d "@$(($(date -u +%s) - RETENTION_DAYS * 86400))" +%Y%m%d)
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
