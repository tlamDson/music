#!/bin/sh
# Smoke test cho backend staging/production sau khi deploy.
# Usage: BASE_URL=https://<railway-backend-domain>/api/v1 sh scripts/smoke-staging.sh
#
# Chỉ kiểm tra được phần API tự động hoá được (health, rate limit).
# Các mục còn lại trong checklist (login UI, upload R2, WS sync 2 tab,
# log JSON) vẫn phải kiểm tra tay — xem docs/PRODUCTION_READINESS.md.

set -eu

BASE_URL="${BASE_URL:?Set BASE_URL, vd: https://cafe-music-staging.up.railway.app/api/v1}"

fail=0

check_status() {
  desc="$1"
  method="$2"
  path="$3"
  expected="$4"
  shift 4

  actual=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$BASE_URL$path" "$@")

  if [ "$actual" = "$expected" ]; then
    echo "[OK]   $desc ($actual)"
  else
    echo "[FAIL] $desc — expected $expected, got $actual"
    fail=1
  fi
}

echo "== Smoke test: $BASE_URL =="

check_status "GET /health" GET /health 200

check_status "GET /health/ready" GET /health/ready 200

echo "-- Rate limit /auth/login (5 req/60s) --"
for i in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"smoke-test@example.invalid","password":"wrong-password"}')
  echo "  attempt $i -> $code"
  if [ "$i" = "6" ]; then
    if [ "$code" = "429" ]; then
      echo "[OK]   rate limit triggered on attempt 6"
    else
      echo "[FAIL] rate limit did not trigger by attempt 6 (got $code)"
      fail=1
    fi
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "== Some checks FAILED =="
  exit 1
fi

echo "== All automated checks passed =="
echo "Nhớ kiểm tra tay: login UI, upload+play track qua R2, WS sync 2 tab, log JSON trên Railway."
