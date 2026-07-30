#!/bin/sh
# Tải bản backup mới nhất (hoặc một file chỉ định) từ R2 rồi restore vào một
# database đích. Dùng cho bài test restore định kỳ VÀ cho lúc thật sự sự cố —
# backup chưa từng restore thử thì coi như chưa có backup.
#
# Usage:
#   R2_ENDPOINT=... R2_ACCESS_KEY=... R2_SECRET_KEY=... \
#     sh scripts/restore-db.sh "postgresql://postgres:postgres@localhost:5432/cafe_music_restore_test"
#
#   # restore một bản cụ thể thay vì bản mới nhất
#   sh scripts/restore-db.sh "<target-url>" cafe-music-production-20260801-1800.sql.gz
#
# ⚠️ Script GHI ĐÈ schema public của database đích. Đừng trỏ vào DB đang dùng —
# hãy tạo một DB scratch riêng:
#   docker exec cafe_music_postgres createdb -U postgres cafe_music_restore_test

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

echo "== Restore vào database đích =="
# Dựng lại schema public để restore không đụng object cũ còn sót.
psql "$TARGET_URL" -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
gunzip -c "$OBJECT" | psql "$TARGET_URL" -v ON_ERROR_STOP=1 --quiet

rm -f "$OBJECT"

echo
echo "== Xong. Kiểm tra bản restore có DÙNG ĐƯỢC không, đừng dừng ở 'lệnh chạy xong': =="
echo "   DATABASE_URL='$TARGET_URL' pnpm --filter @cafe-music/backend exec prisma migrate status"
echo "   psql '$TARGET_URL' -c 'SELECT (SELECT count(*) FROM \"User\") AS users, (SELECT count(*) FROM \"Store\") AS stores, (SELECT count(*) FROM \"Track\") AS tracks;'"
