#!/bin/sh
# Set toàn bộ biến môi trường backend cho Railway environment "staging" trong một lần,
# thay vì gõ tay từng biến trên dashboard.
#
# Yêu cầu trước khi chạy:
#   - Railway CLI đã cài: npm i -g @railway/cli
#   - Đã `railway login`
#   - Đã `railway link` vào đúng project, chọn environment "staging" + service backend
#     (script sẽ in `railway status` ra để bạn tự xác nhận trước khi set biến thật)
#   - Đã tạo .env.staging.local ở root repo (copy từ scripts/staging.env.example,
#     điền giá trị thật — file .env.staging.local bị .gitignore chặn, không commit được)
#
# Usage: sh scripts/setup-railway-staging-env.sh

set -eu

ENV_FILE=".env.staging.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Không tìm thấy $ENV_FILE ở root repo." >&2
  echo "Chạy: cp scripts/staging.env.example $ENV_FILE   rồi điền giá trị thật." >&2
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "Chưa cài Railway CLI. Chạy: npm i -g @railway/cli" >&2
  exit 1
fi

echo "== railway status (xác nhận đúng project / environment staging / service backend) =="
status_output=$(railway status)
echo "$status_output"
echo

if printf '%s' "$status_output" | grep -qi "environment.*production"; then
  echo "DỪNG: railway status cho thấy đang trỏ vào environment 'production'." >&2
  echo "Script này chỉ dùng cho staging — chạy 'railway environment' để đổi environment rồi thử lại." >&2
  exit 1
fi

printf 'Thông tin trên đúng project + environment staging + service backend chưa? [y/N] '
read -r confirm
case "$confirm" in
  y|Y) ;;
  *)
    echo "Huỷ. Chạy 'railway link' / 'railway environment' để trỏ đúng chỗ rồi thử lại." >&2
    exit 1
    ;;
esac

gen_secret() {
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
}

tmp_file=$(mktemp)

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|'#'*)
      printf '%s\n' "$line" >>"$tmp_file"
      continue
      ;;
  esac

  key=$(printf '%s' "$line" | cut -d= -f1)
  value=$(printf '%s' "$line" | cut -d= -f2-)

  case "$key" in
    JWT_ACCESS_SECRET | JWT_REFRESH_SECRET)
      if [ -z "$value" ]; then
        value=$(gen_secret)
        echo "  [auto-gen] $key"
      fi
      ;;
    *)
      if [ -z "$value" ]; then
        echo "  [SKIP] $key đang trống trong $ENV_FILE — điền giá trị thật rồi chạy lại script." >&2
        printf '%s\n' "$line" >>"$tmp_file"
        continue
      fi
      ;;
  esac

  echo "  set $key"
  railway variables --set "$key=$value" >/dev/null

  printf '%s=%s\n' "$key" "$value" >>"$tmp_file"
done <"$ENV_FILE"

mv "$tmp_file" "$ENV_FILE"

echo
echo "== Xong. Danh sách biến hiện có trên Railway: =="
railway variables

echo
echo "Nhắc lại: WEB_URL còn placeholder/trống cho tới khi có domain Vercel cố định (Bước 3)."
echo "Điền WEB_URL vào $ENV_FILE rồi chạy lại script này để cập nhật (các biến khác không đổi)."
