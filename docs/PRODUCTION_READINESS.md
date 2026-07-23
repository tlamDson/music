# Production Readiness — Trạng thái & Bước tiếp theo

> File này là **điểm bắt đầu** cho bất kỳ ai (người hoặc AI) tiếp tục việc đưa dự án lên production.
> Cập nhật lần cuối: 2026-07-23 · Nhánh chuẩn: `develop`

## TL;DR

Hạ tầng đích: **Vercel** (web) · **Railway** (backend + Postgres + Redis) · **Cloudflare R2** (lưu track).

| Phase | Nội dung                                                                                              | Trạng thái                  |
| ----- | ----------------------------------------------------------------------------------------------------- | --------------------------- |
| **0** | Code readiness — vá blocker config/security, migration, Dockerfile, CI, health check, logging         | ✅ **Xong** (10 PR, #9–#18) |
| **1** | Staging — dựng Railway env `staging` + R2 bucket + Vercel preview, seed tài khoản, test tay           | ⬜ Chưa bắt đầu             |
| **2** | Production — provision prod, cắt release `v0.1.0` (tag + GitHub Release), bootstrap admin, smoke test | ⬜ Chưa bắt đầu             |

**Việc code còn nợ trước khi sang Phase 2:** bump `version` lên `0.1.0` ở 3 `package.json` (hiện đều là `0.0.1`) + viết `CHANGELOG.md`. Cố ý để dành đến khi test local xong để khỏi bump hai lần.

---

## Phase 0 đã làm gì (10 PR, đều merge vào `develop` với CI xanh)

| PR  | Nội dung                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| #9  | Validate env bằng Zod (crash lúc boot nếu thiếu biến); `RedisService` đọc `REDIS_URL`; bỏ `fallback-secret` của JWT; `S3_FORCE_PATH_STYLE` theo env |
| #10 | Đăng ký `ThrottlerGuard`; helmet; `trust proxy`; global exception filter; giới hạn upload ở tầng multer                                             |
| #11 | WS CORS theo `WEB_URL`; phân quyền `join-group`; log lỗi auth WS                                                                                    |
| #12 | Baseline Prisma migration `20260722000000_init`                                                                                                     |
| #13 | Seed lấy mật khẩu từ env; thêm script `prisma:bootstrap` cho prod                                                                                   |
| #14 | `apps/backend/Dockerfile` + `railway.json` + `.dockerignore`; siết `.gitignore`                                                                     |
| #15 | Sửa fallback URL của web (3001 → 4000); security headers cho Next.js                                                                                |
| #16 | CI thêm job `Typecheck + Build` và `Backend Docker Build`; bổ sung `prisma:generate` cho `ci-main.yml`                                              |
| #17 | Health check bằng Terminus: `/health` (liveness) + `/health/ready` (DB + Redis)                                                                     |
| #18 | Structured logging bằng pino (JSON ở prod, pretty ở dev, có request id, redact credential)                                                          |

### Những lỗi nghiêm trọng đã vá (để hiểu vì sao code hiện tại như vậy)

- **Rate limit không hề chạy** — `ThrottlerModule` đã config nhưng chưa bao giờ đăng ký guard, `/auth/login` không có gì chặn brute-force.
- **Nghe lén được sync group của tổ chức khác** — `join-group` chỉ xác thực "là user hợp lệ" rồi cho join thẳng room được yêu cầu.
- **Container prod không khởi động được** — script trong `prisma/` import từ `src/` đẩy output thành `dist/src/main.js` trong khi `start:prod` chạy `node dist/main`. Đã khoá bằng `"include": ["src/**/*"]` trong `tsconfig.build.json`.
- **`/health/ready` treo vô hạn khi Redis chết** — ioredis xếp hàng command lúc mất kết nối nên `ping()` không bao giờ reject. Đã thêm timeout 3s cho cả Redis lẫn Prisma check.
- **`.env.production` / `.env.staging` không bị gitignore** — chỉ `.env`, `.env.local`, `.env.*.local` được chặn.
- **`ci-main.yml` thiếu `prisma:generate`** — chưa lộ ra vì lần cuối nó chạy là trên code scaffold chưa dùng Prisma thật.

---

## Cạm bẫy đã gặp — đọc để khỏi vấp lại

1. **turbo cần tên package đầy đủ scope, pnpm thì không.**
   - `pnpm turbo build --filter=backend` → ❌ `No package found with name 'backend'`
   - `pnpm turbo build --filter=@cafe-music/backend` → ✅
   - `pnpm --filter backend test:unit` → ✅ (pnpm match cả theo tên thư mục)
   - ⚠️ **Build command của Vercel phải là** `cd ../.. && pnpm turbo run build --filter=@cafe-music/web`

2. **Healthcheck path có prefix**: `/api/v1/health`, không phải `/health`. App đặt global prefix `/api/v1`.

3. **Railway probe `/health` (liveness), KHÔNG probe `/health/ready`.** Nếu probe readiness, Postgres chập chờn một nhịp là Railway restart container — giết luôn phần đang chạy được. `/health/ready` chỉ để chẩn đoán.

4. **Không thêm key ngoài schema vào `railway.json`** — có thể bị Railway từ chối config.

5. **DB dev tạo bằng `db push`** phải chạy `prisma migrate resolve --applied 20260722000000_init` một lần, nếu không `migrate deploy` báo "table already exists". _(DB dev trên máy chủ repo đã baseline rồi.)_

6. **Backend không boot được nếu Docker chưa chạy** — env validation crash ngay. Thấy backend không lên thì kiểm tra Docker trước tiên.

7. **Đừng `Stop-Process -Name node` bừa** — Docker Desktop cũng chạy Node, giết hết là Docker sập. Lọc theo `CommandLine` cho đúng tiến trình app.

8. **`apps/web/AGENTS.md` bảo đọc `node_modules/next/dist/docs/` trước khi code, nhưng thư mục đó không tồn tại** (Next 15.3.4 là bản chuẩn). Ghi chú này có vẻ đã lỗi thời — verify bằng cách chạy thật thay vì tin vào nó.

---

## Phase 1 — Staging (chưa làm, cần tài khoản của chủ repo)

Mô hình: `develop` → **staging**, `main` → **production**. Mỗi môi trường có DB/Redis/bucket/JWT secret **riêng**.

1. **Railway** — tạo environment `staging`, backend deploy từ nhánh `develop`, kèm Postgres + Redis riêng.
2. **Cloudflare R2** — bucket `cafe-music-staging`, API token scope riêng, bật CORS cho origin web staging.
3. **Vercel** — gán branch domain cố định cho `develop`; env ở scope **Preview** trỏ về backend staging.
4. **Seed tài khoản test** — đặt `SEED_ADMIN_PASSWORD` / `SEED_STORE_PASSWORD` trong env staging rồi chạy `prisma:seed`.
   ⚠️ Nếu staging chạy `NODE_ENV=production` thì seed **từ chối chạy** (đúng thiết kế) — khi đó dùng `prisma:bootstrap`.
5. Smoke test tay theo checklist dưới.

### Biến môi trường backend (dùng chung cho staging & production, giá trị khác nhau)

```
NODE_ENV=production
PORT                     # Railway tự inject
DATABASE_URL             # variable reference tới Postgres của môi trường đó
REDIS_URL                # variable reference tới Redis của môi trường đó
JWT_ACCESS_SECRET        # >= 32 ký tự, generate riêng cho từng môi trường
JWT_REFRESH_SECRET       # >= 32 ký tự, KHÔNG dùng lại giữa staging và prod
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
WEB_URL                  # URL web của môi trường đó — CORS (HTTP + WS) phụ thuộc biến này
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET
S3_ACCESS_KEY / S3_SECRET_KEY
S3_FORCE_PATH_STYLE=true   # R2 cần path style; AWS S3 thật thì đặt false
LOG_LEVEL=info             # tuỳ chọn
```

Generate secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

Biến của web (Vercel): `NEXT_PUBLIC_API_URL` (**có** `/api/v1`) và `NEXT_PUBLIC_WS_URL` (**không** có `/api/v1`).

---

## Phase 2 — Production + release `v0.1.0` (chưa làm)

1. Provision hạ tầng prod tách hẳn staging (secret generate mới).
2. **Cắt release**: bump `version` → `0.1.0` ở 3 `package.json`, viết `CHANGELOG.md`, mở PR `develop → main` title `chore: release v0.1.0 to production`.
   → **Chỉ chủ repo được merge vào `main`.**
3. Sau khi merge: tạo tag + GitHub Release `v0.1.0` làm mốc rollback.
4. **Bootstrap tài khoản đầu tiên** (KHÔNG seed demo lên prod):
   ```bash
   BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=<>= 12 ký tự> \
   pnpm --filter @cafe-music/backend prisma:bootstrap
   ```
   Idempotent. Xong thì đăng nhập, tạo store/user thật trên dashboard, rồi **xoá 2 biến bootstrap** khỏi env.
5. Smoke test (dưới đây).

### Smoke test checklist

- [ ] `GET /api/v1/health` → 200; `GET /api/v1/health/ready` → 200 với `database` và `redis` đều `up`
- [ ] Đăng nhập từ web production được
- [ ] Sai mật khẩu 6 lần liên tiếp → **429** (rate limit 5/60s)
- [ ] Upload một file MP3 nhỏ → thấy object trong R2, phát được từ trình duyệt (kiểm chứng CORS của bucket)
- [ ] Mở 2 trình duyệt cùng sync group → WS kết nối không lỗi CORS, play/pause đồng bộ
- [ ] Tài khoản ngoài tổ chức thử `join-group` → bị từ chối
- [ ] Log Railway ra JSON, có `req.id`, không chứa password/token
- [ ] Domain + HTTPS hoạt động

**Rollback:** Railway redeploy image cũ từ history · Vercel instant rollback về deployment trước.

---

## Fast-follow (không chặn launch — quyết định sau)

| Việc                           | Khi nào cần                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Socket.IO Redis adapter        | **Bắt buộc** trước khi chạy ≥ 2 instance, nếu không sync group bị split-brain. 5 cửa hàng / 1 instance thì chưa cần |
| Refresh token revocation       | Token 7 ngày hiện không thu hồi được. Nên làm trước khi có user thật                                                |
| Upload streaming lên R2        | Hiện buffer tối đa 50MB vào RAM. Đủ dùng ở concurrency thấp                                                         |
| Dùng `CDN_BASE_URL`            | Env đã có nhưng chưa consume — tối ưu chi phí/độ trễ                                                                |
| Bật integration + E2E trong CI | Scaffolding đã có, CI mới chạy unit test                                                                            |

## Quyết định thiết kế đã chốt (đừng lật lại nếu không có lý do mới)

- **Giữ staging** dù chỉ ~5 cửa hàng: app chạy 24/7, không để bug release rơi thẳng vào khách.
- **Giữ Redis**: là cache trạng thái sync, code phụ thuộc cứng; Railway Redis rẻ + zero-ops; trạng thái "đang phát" sống sót qua mỗi lần redeploy (TTL 24h). Gỡ Redis là tối giản tuỳ chọn, không phải việc của lần launch đầu.
- **Dockerfile thay vì Nixpacks**: workspace pnpm cần build `@cafe-music/shared` trước backend và cần `prisma generate` — làm tay để build xác định.
- **Runner stage copy nguyên cây `/app`**: `node_modules` của pnpm là symlink vào `.pnpm` store, copy lẻ sẽ đứt liên kết. Đổi lại image còn dev dependency — chấp nhận được ở quy mô này.
