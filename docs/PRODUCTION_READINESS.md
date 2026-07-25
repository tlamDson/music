# Production Readiness — Trạng thái & Bước tiếp theo

> File này là **điểm bắt đầu** cho bất kỳ ai (người hoặc AI) tiếp tục việc đưa dự án lên production.
> Cập nhật lần cuối: 2026-07-25 · Nhánh chuẩn: `develop`

## TL;DR

Hạ tầng đích: **Vercel** (web) · **Railway** (backend + Postgres + Redis) · **Cloudflare R2** (lưu track).

| Phase | Nội dung                                                                                              | Trạng thái                                                            |
| ----- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **0** | Code readiness — vá blocker config/security, migration, Dockerfile, CI, health check, logging         | ✅ **Xong** (10 PR, #9–#18)                                           |
| **1** | Staging — dựng Railway env `staging` + R2 bucket + Vercel preview, seed tài khoản, test tay           | ✅ **Live** (2026-07-25) — xem "Trạng thái staging hiện tại" bên dưới |
| **2** | Production — provision prod, cắt release `v0.1.0` (tag + GitHub Release), bootstrap admin, smoke test | ⬜ Chưa bắt đầu                                                       |

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

9. **Vercel tự chặn deploy nếu Next.js dính CVE đã biết** — lỗi `"Vulnerable version of Next.js detected, please update immediately"`. Next 15.3.4 dính, phải nâng lên bản patch mới nhất **cùng minor** (`15.3.9`) thay vì nhảy thẳng lên major mới (Next 16 breaking change lớn, xem cạm bẫy #8). Bump cả `next` lẫn `eslint-config-next` cùng version, chạy `pnpm install` cập nhật lockfile.

10. **Vercel monorepo: "New Project" tự đoán nhầm Root Directory** — với repo này nó chọn `apps/backend` (preset NestJS) thay vì `apps/web`. Backend **không** deploy trên Vercel (đã có Railway) — luôn kiểm tra/sửa Root Directory = `apps/web` trước khi bấm Deploy lần đầu.

11. **Biến `NEXT_PUBLIC_*` trên Vercel scope theo từng Environment riêng (Production / Preview / Development), không dùng chung.** Thêm biến ở tab Production thì tab Preview vẫn trống — build nhánh `develop` (chạy trong Preview) sẽ fallback về giá trị mặc định trong code (`localhost:4000`), khiến web gọi API vào máy người dùng thay vì backend thật. Luôn kiểm tra đúng tab Environment trước khi thêm biến, và **phải trigger rebuild** sau khi sửa vì `NEXT_PUBLIC_*` chỉ được đọc lúc build, không phải runtime.

12. **Vercel Deployment Protection (SSO) chặn cả người ngoài lẫn công cụ tự động khỏi preview deployment theo mặc định** — bất kỳ ai không phải thành viên team Vercel (kể cả `curl`) mở domain branch sẽ bị `302` redirect sang `vercel.com/sso-api`, không bao giờ chạm tới app thật. Cần tắt ở **Settings → Deployment Protection** (chọn "Only Production" hoặc tắt hẳn cho Preview) nếu staging cần ai cũng test được qua trình duyệt bình thường.

13. **Không cần lên Vercel Pro để có domain cố định theo nhánh.** Mỗi branch tự có sẵn URL miễn phí dạng `<project>-git-<branch>-<team>.vercel.app`, luôn trỏ tới deployment mới nhất của nhánh đó — dùng thẳng cho `WEB_URL`. Tính năng **Custom Environments** (trả phí, ~$30+/tháng) là thứ khác, không cần cho nhu cầu này.

14. **`railway ssh` trên Windows Git Bash: 2 lỗi âm thầm dễ dính cùng lúc.**
    - Đường dẫn Unix (`/app/...`) bị Git Bash tự dịch thành đường dẫn Windows (`C:/Program Files/Git/app/...`) trước khi gửi đi — set `MSYS_NO_PATHCONV=1` trước lệnh `railway ssh` nếu remote command có path bắt đầu bằng `/`.
    - `railway ssh -- sh -c "VAR=a VAR2=b cmd"` (3 tham số riêng: `sh`, `-c`, chuỗi lệnh) bị Railway CLI nối lại bằng dấu cách trước khi gửi remote, xoá mất ranh giới của `-c` — remote shell chỉ chạy đúng từ đầu tiên (`VAR=a`) rồi thoát, **exit code 0, không output, không chạy lệnh thật**. Luôn gộp toàn bộ remote command thành **một chuỗi duy nhất** sau `--` (không tự thêm `sh -c`), và tránh khoảng trắng trong giá trị biến để không dính lại vấn đề tương tự.
    - CLI cũng hay mất link project/environment/service giữa các lần gọi riêng biệt (mỗi lệnh terminal mới) — báo `No linked project found`. Chạy lại `railway link --project <id> --environment <env> --service <name>` (dùng flag, không chọn tương tác) trước khi chạy lệnh phụ thuộc link.

---

## Phase 1 — Staging

Mô hình: `develop` → **staging**, `main` → **production**. Mỗi môi trường có DB/Redis/bucket/JWT secret **riêng**.

### Trạng thái staging hiện tại (live từ 2026-07-25)

| Thành phần             | Giá trị                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Railway project        | `awake-endurance`, environment `staging`, service `backend`                                                        |
| Backend domain         | `https://backend-staging-6091.up.railway.app`                                                                      |
| Web domain (`develop`) | `https://cafe-music-web-git-develop-lam-phams-projects-44c4677b.vercel.app` (free git-branch URL, xem cạm bẫy #13) |
| R2 bucket              | `cafe-music-staging`                                                                                               |
| Deployment Protection  | Đã tắt cho Preview (xem cạm bẫy #12) — ai cũng vào được domain trên qua trình duyệt bình thường                    |

Đã verify end-to-end qua chrome-devtools MCP: login → vào đúng `/dashboard`, đúng role `ORG_ADMIN`. `/health` và `/health/ready` đều `up` (database + redis).

**Nợ đã biết, chưa chặn launch:** rate limit `/auth/login` (`@Throttle({limit:5, ttl:60000})`) có hoạt động (`429` xuất hiện) nhưng **không nhất quán** khi test dồn dập trên Railway — có lúc 6+ request sai liên tiếp vẫn lọt qua trót lọt (401 thay vì 429), có lúc chặn rồi lại mở ra giữa chừng trong cùng cửa sổ 60s, dù cùng 1 deployment instance và cùng client IP (xác nhận qua `railway logs --http`). Nghi vấn: cơ chế lưu trạng thái in-memory của `@nestjs/throttler` có vấn đề timing/race trên môi trường Railway. **Cần điều tra thêm trước khi có user thật** (brute-force login có thể không bị chặn triệt để) — chưa xác định được có phải bug code hay đặc thù platform.

1. **Railway** — tạo environment `staging`, backend deploy từ nhánh `develop`, kèm Postgres + Redis riêng.
2. **Cloudflare R2** — bucket `cafe-music-staging`, API token scope riêng, bật CORS cho origin web staging.
3. **Vercel** — gán **branch domain cố định** cho `develop` (không dùng preview URL đổi theo mỗi commit — hoặc dùng luôn free git-branch URL, xem cạm bẫy #13); env ở scope **Preview** trỏ về backend staging (nhớ scope đúng tab, xem cạm bẫy #11); tắt **Deployment Protection** cho Preview nếu cần ai cũng test được (cạm bẫy #12).
   ⚠️ **CORS production chỉ nhận đúng một origin** (`WEB_URL`, xem `apps/backend/src/main.ts` + `ws-cors-origin.ts`) — cả HTTP lẫn WebSocket. Nếu `WEB_URL` không khớp đúng domain branch cố định này, web staging bị chặn CORS (API 4xx, WS không connect được).
4. **Tài khoản admin thật** — staging chạy `NODE_ENV=production` như prod nên `prisma:seed` **từ chối chạy**. Dùng `prisma:bootstrap` qua `railway ssh` (không dùng `railway run` — `DATABASE_URL` trỏ `*.railway.internal`, chỉ resolve được bên trong mạng Railway, xem cạm bẫy #14) để tạo 1 org + 1 `ORG_ADMIN`, xem chi tiết ở Phase 2 bước 4.
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
WEB_URL                  # URL web của môi trường đó — CORS (HTTP + WS) phụ thuộc biến này.
                          # Phải khớp CHÍNH XÁC domain đang mở (staging: branch domain cố
                          # định của Vercel, không phải preview URL đổi theo commit) — CORS
                          # production chỉ nhận đúng một origin, không có danh sách hay wildcard.
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET
S3_ACCESS_KEY / S3_SECRET_KEY
S3_FORCE_PATH_STYLE=true   # R2 cần path style; AWS S3 thật thì đặt false
LOG_LEVEL=info             # tuỳ chọn
```

Generate secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

**Set hết một lần bằng script** thay vì gõ tay từng biến trên dashboard (staging):

```bash
cp scripts/staging.env.example .env.staging.local   # điền giá trị thật, file này bị .gitignore chặn
railway login && railway link                        # chọn đúng project, environment "staging", service backend
sh scripts/setup-railway-staging-env.sh
```

Script tự sinh `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` nếu để trống (và ghi lại vào `.env.staging.local` để chạy lại không đổi secret), bỏ qua biến còn trống (vd `WEB_URL` trước khi có domain Vercel — điền rồi chạy lại), và **chặn cứng** nếu `railway status` cho thấy đang trỏ vào environment `production`.

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

Phần tự động hoá được (health check + rate limit login) có sẵn ở `scripts/smoke-staging.sh`:

```bash
BASE_URL=https://<railway-backend-domain>/api/v1 sh scripts/smoke-staging.sh
```

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

| Việc                                                   | Khi nào cần                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Socket.IO Redis adapter                                | **Bắt buộc** trước khi chạy ≥ 2 instance, nếu không sync group bị split-brain. 5 cửa hàng / 1 instance thì chưa cần |
| Refresh token revocation                               | Token 7 ngày hiện không thu hồi được. Nên làm trước khi có user thật                                                |
| Upload streaming lên R2                                | Hiện buffer tối đa 50MB vào RAM. Đủ dùng ở concurrency thấp                                                         |
| Dùng `CDN_BASE_URL`                                    | Env đã có nhưng chưa consume — tối ưu chi phí/độ trễ                                                                |
| Bật integration + E2E trong CI                         | Scaffolding đã có, CI mới chạy unit test                                                                            |
| Điều tra rate limit login không nhất quán trên Railway | **Nên làm trước khi có user thật** — xem chi tiết ở Phase 1 mục "Trạng thái staging hiện tại"                       |

## Quyết định thiết kế đã chốt (đừng lật lại nếu không có lý do mới)

- **Giữ staging** dù chỉ ~5 cửa hàng: app chạy 24/7, không để bug release rơi thẳng vào khách.
- **Giữ Redis**: là cache trạng thái sync, code phụ thuộc cứng; Railway Redis rẻ + zero-ops; trạng thái "đang phát" sống sót qua mỗi lần redeploy (TTL 24h). Gỡ Redis là tối giản tuỳ chọn, không phải việc của lần launch đầu.
- **Dockerfile thay vì Nixpacks**: workspace pnpm cần build `@cafe-music/shared` trước backend và cần `prisma generate` — làm tay để build xác định.
- **Runner stage copy nguyên cây `/app`**: `node_modules` của pnpm là symlink vào `.pnpm` store, copy lẻ sẽ đứt liên kết. Đổi lại image còn dev dependency — chấp nhận được ở quy mô này.
