#!/bin/sh
# Tải bản backup mới nhất (hoặc một file chỉ định) từ R2 rồi restore vào một
# database đích. Dùng cho bài test restore định kỳ VÀ cho lúc thật sự sự cố —
# backup chưa từng restore thử thì coi như chưa có backup.
#
# Usage:
#   R2_ENDPOINT=... R2_ACCESS_KEY=... R2_SECRET_KEY=... \
#     sh scripts/restore-db.sh "postgresql://postgres@localhost:55432/postgres"
#
#   # restore một bản cụ thể thay vì bản mới nhất
#   sh scripts/restore-db.sh "<target-url>" cafe-music-production-20260801-1800.sql.gz
#
# ⚠️ Script GHI ĐÈ schema public của database đích. Đừng trỏ vào DB đang dùng —
# hãy dựng một DB scratch dùng một lần, ĐÚNG major version của bản dump (DB dev
# trong docker-compose là PG16, không đọc được dump của pg_dump 18):
#   docker run -d --name pg-restore-test -e POSTGRES_HOST_AUTH_METHOD=trust \
#     -p 55432:5432 postgres:18-alpine
#   (trust auth: container tạm, chỉ nghe localhost, xoá ngay sau khi test xong)

set -eu

TARGET_URL="${1:?Truyền connection string của database đích làm tham số 1}"
OBJECT="${2:-}"

R2_ENDPOINT="${R2_ENDPOINT:?Set R2_ENDPOINT}"
R2_ACCESS_KEY="${R2_ACCESS_KEY:?Set R2_ACCESS_KEY}"
R2_SECRET_KEY="${R2_SECRET_KEY:?Set R2_SECRET_KEY}"
R2_BUCKET="${R2_BUCKET:-cafe-music-backups}"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY"
export AWS_DEFAULT_REGION=auto

case "$TARGET_URL" in
  *railway* | *rlwy.net*)
    echo "DỪNG: đích trông như một database trên Railway." >&2
    echo "Script này ghi đè schema — chỉ dùng cho DB scratch cục bộ." >&2
    exit 1
    ;;
esac

if [ -z "$OBJECT" ]; then
  echo "== Tìm bản backup mới nhất trong r2://$R2_BUCKET =="
  # Tên file có timestamp UTC nên sắp xếp theo tên = sắp theo thời gian.
  OBJECT=$(aws s3 ls "s3://$R2_BUCKET/" --endpoint-url "$R2_ENDPOINT" |
    awk '{print $4}' | grep '\.sql\.gz$' | sort | tail -1)
  [ -n "$OBJECT" ] || {
    echo "Không có file backup nào trong bucket." >&2
    exit 1
  }
fi

echo "== Tải $OBJECT =="
aws s3 cp "s3://$R2_BUCKET/$OBJECT" "$OBJECT" --endpoint-url "$R2_ENDPOINT"

# Ràng buộc là phiên bản **pg_dump đã tạo file**, không phải phiên bản server
# nguồn: pg_dump >= 17 ghi `SET transaction_timeout = 0` vào đầu file, và server
# cũ hơn từ chối tham số đó rồi chết giữa chừng với "unrecognized configuration
# parameter" — thông báo chẳng gợi ý gì về nguyên nhân thật.
# Đã dẫm phải: pg_dump 18 dump một server PG16, restore vào PG16 vẫn hỏng.
dump_major=$(gunzip -c "$OBJECT" | sed -n 's/^-- Dumped by pg_dump version \([0-9]*\).*/\1/p' | head -1)
target_major=$(psql "$TARGET_URL" -t -A -c 'SHOW server_version_num;' | cut -c1-2)

if [ -n "$dump_major" ] && [ -n "$target_major" ] && [ "$target_major" -lt "$dump_major" ]; then
  echo "DỪNG: file dump do pg_dump $dump_major tạo, database đích là Postgres $target_major." >&2
  echo "Server cũ hơn không đọc được lệnh SET của bản dump mới. Dựng DB scratch đúng version:" >&2
  echo "  docker run -d --name pg-restore-test -e POSTGRES_HOST_AUTH_METHOD=trust -p 55432:5432 postgres:${dump_major}-alpine" >&2
  echo "  sh scripts/restore-db.sh 'postgresql://postgres@localhost:55432/postgres' $OBJECT" >&2
  rm -f "$OBJECT"
  exit 1
fi

echo "== Restore vào database đích (dump pg_dump $dump_major → đích PG$target_major) =="
# Dựng lại schema public để restore không đụng object cũ còn sót.
psql "$TARGET_URL" -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
gunzip -c "$OBJECT" | psql "$TARGET_URL" -v ON_ERROR_STOP=1 --quiet

rm -f "$OBJECT"

echo
echo "== Xong. Kiểm tra bản restore có DÙNG ĐƯỢC không, đừng dừng ở 'lệnh chạy xong': =="
echo "   DATABASE_URL='$TARGET_URL' pnpm --filter @cafe-music/backend exec prisma migrate status"
echo "   psql '$TARGET_URL' -c 'SELECT (SELECT count(*) FROM \"User\") AS users, (SELECT count(*) FROM \"Store\") AS stores, (SELECT count(*) FROM \"Track\") AS tracks;'"
