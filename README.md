# Cafe Music

Nền tảng phát nhạc đồng bộ cho chuỗi quán cafe. Admin chuỗi tạo playlist và bấm phát; nhạc chạy đồng bộ ra loa từng quán, mỗi quán có console riêng và một màn chiếu TV.

Monorepo TypeScript (pnpm + Turborepo): NestJS backend, Next.js web, package `shared` dùng chung.

| Việc cần làm                              | Đọc file                                                     |
| ----------------------------------------- | ------------------------------------------------------------ |
| Dựng môi trường dev, chạy app trên máy    | [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)           |
| Deploy, biến môi trường, cạm bẫy vận hành | [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) |
| Quy ước code, kiến trúc, quy trình PR     | [CLAUDE.md](CLAUDE.md) + [.claude/rules/](.claude/rules/)    |
| Lịch sử thay đổi từng bản                 | [CHANGELOG.md](CHANGELOG.md)                                 |

```bash
docker compose up -d   # Postgres, Redis, MinIO
pnpm install
pnpm dev
curl http://localhost:4000/api/v1/health
```

> Backend **không boot được nếu Docker chưa chạy** — env validation crash ngay lúc khởi động. Thấy backend không lên thì kiểm tra Docker trước tiên.

---

## Hạ tầng

| Thành phần  | Chạy ở đâu       | Ghi chú                                                 |
| ----------- | ---------------- | ------------------------------------------------------- |
| Web         | Vercel           | HTTPS sẵn có                                            |
| Backend     | Railway (Docker) | HTTPS sẵn có                                            |
| Postgres    | Railway          | Backup: xem mục dưới                                    |
| Redis       | Railway          | Trạng thái phát của quán + counter rate limit           |
| File nhạc   | Cloudflare R2    | Bucket riêng cho từng môi trường                        |
| Lỗi runtime | Sentry           | Backend + web, phân biệt nhau bằng `SENTRY_ENVIRONMENT` |

Mỗi môi trường (staging / production) có DB, Redis, bucket và JWT secret **riêng**. Domain + trạng thái cụ thể nằm trong [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

## Deploy

**Không ai deploy tay.** Merge là deploy:

| Merge vào | Kéo theo                                                     |
| --------- | ------------------------------------------------------------ |
| `develop` | Railway build lại backend staging + Vercel build web staging |
| `main`    | Tương tự cho production                                      |

**Migration cũng tự chạy.** `apps/backend/docker-entrypoint.sh` chạy `prisma migrate deploy` **trước** khi khởi động app, nên mỗi lần container lên (deploy mới, restart, scale) schema tự được áp rồi app mới mở cổng. Lệnh idempotent.

→ **Đừng chạy `migrate deploy` tay.** Chỉ cần khi migration lỗi làm container crash-loop (không bao giờ tới được bước migrate) — cách chạy tay ở [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) cạm bẫy #15.

Biến môi trường sống ở **dashboard của Railway (backend) và Vercel (web)**, không bao giờ trong git. `.env*` đã bị `.gitignore` chặn. Danh sách biến đầy đủ: [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md).

⚠️ Biến `NEXT_PUBLIC_*` của Vercel **bake vào lúc build** và **scope theo từng Environment** (Production / Preview riêng biệt) — sửa xong phải trigger rebuild, và nhớ kiểm tra đúng tab.

## Rollback

Theo thứ tự nhanh → chậm:

1. **Web hỏng** → Vercel → Deployments → deployment trước → _Instant Rollback_.
2. **Backend hỏng** → Railway → service `backend` → Deployments → deployment trước → _Redeploy_.
3. **Cần quay về đúng một bản đã biết** → mỗi release có tag `vX.Y.Z` + GitHub Release làm mốc.
4. **Data hỏng** → restore từ backup, xem dưới.

Rollback code **không** tự rollback database. Migration nào xoá cột/bảng thì phải khôi phục bằng backup.

## Backup & restore

Hai lớp, vì snapshot của Railway nằm cùng account với DB — mất account là mất luôn backup:

| Lớp                       | Tần suất                | Nằm ở đâu                                |
| ------------------------- | ----------------------- | ---------------------------------------- |
| Snapshot của Railway      | Hằng ngày               | Cùng project Railway                     |
| `pg_dump` → Cloudflare R2 | Hằng ngày, 01:00 giờ VN | Bucket `cafe-music-backups`, giữ 30 ngày |

Lớp 2 chạy bằng [.github/workflows/backup-db.yml](.github/workflows/backup-db.yml) (bấm _Run workflow_ để chạy tay). Job **fail nếu file dump nhỏ bất thường** — backup lỗi âm thầm là cái bẫy kinh điển, thà để job đỏ và có mail.

**Restore** (dùng cả cho lúc sự cố lẫn bài test định kỳ):

```bash
# DB scratch dùng một lần — ĐỪNG restore đè lên DB đang dùng.
# Phải là Postgres 18: DB dev trong docker-compose là PG16, mà bản dump do
# pg_dump 18 tạo mang lệnh SET mà server cũ hơn không hiểu. Trỏ nhầm thì script
# dừng lại và nhắc đúng câu lệnh dưới đây.
docker run -d --name pg-restore-test -e POSTGRES_HOST_AUTH_METHOD=trust -p 55432:5432 postgres:18-alpine

R2_ENDPOINT=... R2_ACCESS_KEY=... R2_SECRET_KEY=... \
  sh scripts/restore-db.sh "postgresql://postgres@localhost:55432/postgres"

docker rm -f pg-restore-test   # dọn sau khi xong
```

Script tự lấy bản mới nhất (truyền tên file làm tham số 2 nếu muốn bản cũ hơn).

**Backup chưa test restore thì coi như chưa có backup.** Sau khi restore phải kiểm tra nó thật sự dùng được, đừng dừng ở "lệnh chạy xong":

```bash
DATABASE_URL='<scratch>' pnpm --filter @cafe-music/backend exec prisma migrate status   # → up to date
psql '<scratch>' -c 'SELECT count(*) FROM "User";'                                      # → khớp nguồn
```

| Lần test restore gần nhất | Kết quả                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-01                | ✅ **DB production thật**: dump → restore vào PG18 scratch; 1 org + 1 ORG_ADMIN đúng như prod, 5 migration, `prisma migrate status` báo up to date |
| 2026-07-30                | ✅ Dump → upload → retention → restore chạy hết (bucket MinIO local); số row khớp nguồn                                                            |

## Sức khoẻ hệ thống

| Đường dẫn              | Dùng để                          |
| ---------------------- | -------------------------------- |
| `/api/v1/health`       | Liveness — Railway probe cái này |
| `/api/v1/health/ready` | DB + Redis, **chỉ để chẩn đoán** |

⚠️ **Đừng để Railway probe `/health/ready`** — Postgres chập chờn một nhịp là Railway restart container, giết luôn phần đang chạy được.

Smoke test sau mỗi lần deploy:

```bash
BASE_URL=https://<backend-domain>/api/v1 sh scripts/smoke-staging.sh
```

Log: JSON trên Railway (pino), có `req.id`, tự redact credential. Đổi mức log bằng `LOG_LEVEL`.
