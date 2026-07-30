#!/bin/sh
# Set toàn bộ biến môi trường backend cho một Railway environment trong một lần,
# thay vì gõ tay từng biến trên dashboard.
#
# Usage: sh scripts/setup-railway-env.sh <staging|production>
#
# Yêu cầu trước khi chạy:
#   - Railway CLI đã cài: npm i -g @railway/cli
#   - Đã `railway login`
#   - Đã `railway link` vào đúng project + environment + service backend
#     (script tự đối chiếu `railway status` với environment bạn truyền vào)
#   - Đã tạo .env.<env>.local ở root repo (copy từ scripts/<env>.env.example,
#     điền giá trị thật — file .env.* bị .gitignore chặn, không commit được)
#
# JWT_ACCESS_SECRET / JWT_REFRESH_SECRET: để trống thì script tự sinh và ghi lại
# vào .env.<env>.local, nên chạy lại không đổi secret (không đá người đang đăng
# nhập ra ngoài). Muốn xoay vòng secret thì tự xoá giá trị rồi chạy lại.

set -eu

TARGET_ENV="${1:-}"

case "$TARGET_ENV" in
  staging | production) ;;
  *)
    echo "Usage: sh scripts/setup-railway-env.sh <staging|production>" >&2
    exit 1
    ;;
esac

ENV_FILE=".env.${TARGET_ENV}.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Không tìm thấy $ENV_FILE ở root repo." >&2
  echo "Chạy: cp scripts/${TARGET_ENV}.env.example $ENV_FILE   rồi điền giá trị thật." >&2
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "Chưa cài Railway CLI. Chạy: npm i -g @railway/cli" >&2
  exit 1
fi

echo "== railway status (phải khớp environment '$TARGET_ENV' + service backend) =="
status_output=$(railway status)
echo "$status_output"
echo

# Chặn nhầm môi trường. Set biến staging đè lên production sẽ đổi JWT secret của
# production (đá mọi người đang đăng nhập ra ngoài) và trỏ CORS sang domain sai.
if ! printf '%s' "$status_output" | grep -qi "environment.*$TARGET_ENV"; then
  echo "DỪNG: railway status không cho thấy environment '$TARGET_ENV'." >&2
  echo "Chạy 'railway link --environment $TARGET_ENV' rồi thử lại." >&2
  exit 1
fi

if [ "$TARGET_ENV" = "production" ]; then
  echo "!!  Sắp ghi biến môi trường lên PRODUCTION."
  printf "Gõ đúng chữ 'production' để xác nhận: "
  read -r typed
  if [ "$typed" != "production" ]; then
    echo "Huỷ." >&2
    exit 1
  fi
else
  printf 'Thông tin trên đúng project + environment %s + service backend chưa? [y/N] ' "$TARGET_ENV"
  read -r confirm
  case "$confirm" in
    y | Y) ;;
    *)
      echo "Huỷ. Chạy 'railway link' để trỏ đúng chỗ rồi thử lại." >&2
      exit 1
      ;;
  esac
fi

gen_secret() {
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
}

# Cắt khoảng trắng hai đầu. Không trim thì một giá trị chỉ có dấu cách (rất dễ
# lọt vào khi sửa file bằng tay) lại được coi là "có giá trị": script set nó lên
# Railway, `requiredString` (min 1 ký tự) trong env.schema cho qua, và backend
# boot thành công nhưng chết lúc runtime vì S3_ENDPOINT là một dấu cách.
trim() {
  printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

tmp_file=$(mktemp)

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    '' | '#'*)
      printf '%s\n' "$line" >>"$tmp_file"
      continue
      ;;
  esac

  key=$(trim "$(printf '%s' "$line" | cut -d= -f1)")
  value=$(trim "$(printf '%s' "$line" | cut -d= -f2-)")

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
        printf '%s=\n' "$key" >>"$tmp_file"
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
echo "Nhắc lại: WEB_URL phải khớp CHÍNH XÁC domain web của môi trường này —"
echo "CORS (cả HTTP lẫn WebSocket) chỉ nhận đúng một origin, không có wildcard."
echo "Điền/sửa trong $ENV_FILE rồi chạy lại script (các biến khác không đổi)."
