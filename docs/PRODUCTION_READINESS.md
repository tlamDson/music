# Production Readiness — Trạng thái & Bước tiếp theo

> File này là **điểm bắt đầu** cho bất kỳ ai (người hoặc AI) tiếp tục việc đưa dự án lên production.
> Cập nhật lần cuối: 2026-08-03 · Nhánh chuẩn: `develop`

## TL;DR

Hạ tầng đích: **Vercel** (web) · **Railway** (backend + Postgres + Redis) · **Cloudflare R2** (lưu track).

| Phase | Nội dung                                                                                              | Trạng thái                                                            |
| ----- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **0** | Code readiness — vá blocker config/security, migration, Dockerfile, CI, health check, logging         | ✅ **Xong** (10 PR, #9–#18)                                           |
| **1** | Staging — dựng Railway env `staging` + R2 bucket + Vercel preview, seed tài khoản, test tay           | ✅ **Live** (2026-07-25) — xem "Trạng thái staging hiện tại" bên dưới |
| **2** | Production — provision prod, cắt release `v0.1.0` (tag + GitHub Release), bootstrap admin, smoke test | ✅ **Live** (2026-08-01) — checklist Phase 2 giữ lại làm tham chiếu   |

**Production đã chạy.** Lần launch đầu ra `v0.1.0` (tag + GitHub Release, commit `7cc84ed` trên `main`). Checklist Phase 2 bên dưới giữ nguyên làm tham chiếu cho lần dựng environment mới; **release lần thứ hai trở đi chỉ cần mục [Cắt release](#4-cắt-release)**.

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

15. **Migration trên Railway chạy TỰ ĐỘNG — đừng tưởng phải làm tay.** `apps/backend/docker-entrypoint.sh` chạy `prisma migrate deploy` **trước** khi `exec node dist/main`, nên mọi lần container khởi động (deploy mới, restart, scale) schema tự được áp rồi app mới mở cổng. Merge vào `develop` là staging tự migrate xong. Lệnh idempotent nên deploy lại nhiều lần vô hại.
    - Đã tự dẫm phải: sau khi merge PR #54 (bỏ `SyncGroup`) tôi báo "staging sẽ hỏng tới khi chạy `migrate deploy` tay" — sai, kiểm tra `_prisma_migrations` thì migration đã `finished` từ lúc redeploy.
    - **Khi nào mới cần chạy tay:** migration lỗi khiến entrypoint chết → container crash-loop → không bao giờ tới bước migrate. Lúc đó dùng một trong hai cách dưới.
    - Chạy tay trong container (gộp **một chuỗi** sau `--` và `MSYS_NO_PATHCONV=1` vì path bắt đầu bằng `/`, xem cạm bẫy #14):

      ```bash
      railway link --project <project-id> --environment staging --service backend
      MSYS_NO_PATHCONV=1 railway ssh -- "cd /app/apps/backend && node node_modules/prisma/build/index.js migrate deploy"
      ```

    - Chạy tay từ máy mình, qua `DATABASE_PUBLIC_URL` (dùng được cả khi container đang chết):

      ```bash
      DB_URL=$(railway variables --service Postgres --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
      DATABASE_URL="$DB_URL" pnpm --filter @cafe-music/backend exec prisma migrate deploy
      ```

    - ⚠️ **`railway run` không dùng được cho lệnh chạm DB**: `DATABASE_URL` nó inject trỏ `*.railway.internal`, chỉ resolve được bên trong mạng Railway. Phải là `DATABASE_PUBLIC_URL`.
    - Cách kiểm tra schema staging thật sự đang ở đâu (chỉ đọc):

      ```bash
      DB_URL=$(railway variables --service Postgres --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
      docker exec -i cafe_music_postgres psql "$DB_URL" -t -A -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at;"
      ```

16. **"Generate Domain" trên Railway: port nhập vào KHÔNG tự đồng bộ nếu sửa lại sau đó.** Backend production sau khi merge PR release deploy "Online" nhưng `/api/v1/health` trả `502 Application failed to respond` — log cho thấy app bind đúng port Dockerfile expose (log `Backend listening on port 8080`) nhưng Railway proxy route vào port khác. Đã thử `railway domain update --port 4000` (đổi target port của domain) rồi `railway redeploy` — **không đủ**, app vẫn tự nhận `PORT=8080` từ biến do Railway tiêm lúc "Generate Domain" lần đầu (biến này không hiện trong `railway variables`, không tự cập nhật theo target port sửa sau). Cách sửa chắc chắn: set thẳng biến `PORT` bằng giá trị Dockerfile expose (ở đây là `4000`):

    ```bash
    railway variables --set "PORT=4000" -s <service> -e production
    ```

    Set biến tự trigger redeploy. Verify lại bằng `railway logs | grep "listening on port"` phải khớp con số vừa set, rồi `curl .../health` phải `200`.

17. **`DATABASE_PUBLIC_URL` có host RỖNG cho tới khi bật TCP Proxy.** Postgres mới thêm vào một environment chưa có proxy công khai thì biến này resolve thành `postgresql://postgres:***@:/railway` — thiếu hẳn host và port, nhưng Railway **không báo lỗi**, chỉ trả chuỗi rỗng ở chỗ đó. Prisma báo `empty host in database URL`, còn nếu lỡ copy vào GitHub Secrets thì job backup chết ở bước dump với thông báo chẳng liên quan.
    - Bật bằng CLI (một proxy cho mỗi service): `railway tcp-proxy create --port 5432 --service <postgres-service> --environment production`
    - Xong thì `railway variables --service <postgres-service> --kv | grep DATABASE_PUBLIC_URL` phải thấy host thật (dạng `*.proxy.rlwy.net:<port>`).
    - ⚠️ **Việc này phải làm TRƯỚC khi set secret `PROD_DATABASE_URL`** — set trước thì giá trị lưu lại là bản rỗng host và phải quay lại sửa tay.

18. **Tên service Postgres/Redis trên environment mới KHÔNG trùng với staging.** Railway tự thêm hậu tố ngẫu nhiên (`Postgres-g7te`, `Redis-eEFb`) khi add plugin, nên `${{Postgres.DATABASE_URL}}` copy từ mẫu staging trỏ vào service không tồn tại → Railway resolve thành **chuỗi rỗng**, lại không báo lỗi. Backend boot lên rồi chết ở query đầu tiên. Lấy tên thật bằng `railway status` (mục _All resources → Databases_) rồi sửa reference trong `.env.<env>.local` trước khi chạy `setup-railway-env.sh`. Kiểm chứng sau khi set: `railway variables --kv | grep -E '^(DATABASE|REDIS)_URL='` phải ra connection string đầy đủ, không phải dòng trống.

19. **`aws` báo đúng một câu "Invalid endpoint" cho mọi lỗi định dạng, và GitHub Actions mask giá trị thành `\***`.** Thiếu `https://`, thừa `/`cuối, lẫn`\n`khi dán vào Secrets, hay thừa path bucket — tất cả ra cùng một dòng log vô dụng, lại chỉ nổ **sau khi** đã dump xong nên mỗi lần thử tốn một lượt dump.`scripts/backup-db.sh` giờ tự chuẩn hoá 3 lỗi đầu và chặn sớm (trước khi dump) với thông báo rõ cho lỗi thừa path.
    - ⚠️ **Cron hàng đêm chạy từ default branch (`main`), không phải `develop`.** Fix script nằm ở `develop` thì backup tự động vẫn dùng bản cũ trên `main` cho tới lần release kế. Thử bằng `workflow_dispatch` với `ref: main` để biết chắc cron đêm nay chạy được.

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

**Nợ rate limit đã đóng (2026-07-30).** Nguyên nhân thật: đếm theo IP không dùng được trên Railway — edge round-robin qua nhiều địa chỉ nên `req.ip` (Express suy ra từ `X-Forwarded-For` với `trust proxy: 1`) của cùng một client không ổn định, mỗi key chỉ đếm được một phần request. Đo được bằng header `X-RateLimit-Remaining`: chạy 4,3,2,1 rồi **nhảy lại 4** và không bao giờ ra `429`. Chuyển counter sang Redis (#68) chưa đủ — pattern đổi thành 4,4,3,3,2,2, chứng minh vấn đề nằm ở **key** chứ không phải nơi lưu. Fix cuối (#69): `/auth/login` đếm theo **email đang bị dò**, miễn nhiễm với tầng mạng. Đã verify trên staging: 3/3 lượt đếm sạch 4,3,2,1,0 rồi `429` ở lần thứ 6, và tài khoản khác không bị khoá lây. **Giới hạn còn lại:** không chặn kiểu rải mật khẩu qua nhiều tài khoản; giới hạn 100 req/60s toàn cục vẫn theo IP nên vẫn best-effort.

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
sh scripts/setup-railway-env.sh staging
```

Script tự sinh `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` nếu để trống (và ghi lại vào `.env.staging.local` để chạy lại không đổi secret), bỏ qua biến còn trống (vd `WEB_URL` trước khi có domain Vercel — điền rồi chạy lại), và **chặn cứng** nếu `railway status` không khớp environment truyền vào (với `production` còn bắt gõ đúng chữ `production` để xác nhận).

Biến của web (Vercel): `NEXT_PUBLIC_API_URL` (**có** `/api/v1`) và `NEXT_PUBLIC_WS_URL` (**không** có `/api/v1`).

---

## Phase 2 — Production + release đầu tiên (`v0.1.0`)

> ✅ **Đã chạy xong 2026-08-01.** Bước 1–3 và 5 là việc **một lần** — giữ lại làm tham chiếu cho lần dựng environment mới, không phải làm lại mỗi release. Release lần thứ hai trở đi: nhảy thẳng tới [bước 4](#4-cắt-release).

Thứ tự dưới đây **quan trọng**: `NEXT_PUBLIC_*` của Vercel bake vào lúc build (cạm bẫy #11) và CORS backend chỉ nhận đúng một origin `WEB_URL`, nên cả hai domain phải biết trước khi merge release.

### 1. Provision hạ tầng (tách hẳn staging, secret generate mới)

- [ ] **Cloudflare R2**: bucket `cafe-music-prod` (track) + `cafe-music-backups` (backup), **2 API token riêng** — token của app bị lộ thì không kéo được backup theo. Bật CORS của `cafe-music-prod` cho origin web production.
- [ ] **Sentry**: 2 project free tier (`cafe-music-backend`, `cafe-music-web`), lấy DSN, bật alert mail khi có issue mới.
- [ ] **Railway**: environment `production` trong project `awake-endurance`, **Postgres + Redis mới**, service `backend` deploy từ nhánh `main`, healthcheck `/api/v1/health` (**liveness**, không phải `/health/ready` — cạm bẫy #3), **bật Backups cho Postgres**.
- [ ] **Vercel**: xác nhận Production Branch = `main` và domain production thật (Settings → Domains) — đừng đoán.

⚠️ Lúc provision lần đầu, `main` còn **sau `develop` rất nhiều commit** nên deploy production đầu tiên build code cũ và có thể fail — bình thường, nó build lại đúng khi release PR merge. Muốn tránh log đỏ thì tạm tắt auto-deploy, bật lại trước bước 3.

### 2. Set biến môi trường

```bash
cp scripts/production.env.example .env.production.local   # điền R2 + WEB_URL + SENTRY_DSN thật
railway link --project <project-id> --environment production --service backend
sh scripts/setup-railway-env.sh production                # bắt gõ đúng chữ "production" để xác nhận
```

JWT secret để **trống** cho script tự sinh — phải khác staging hoàn toàn.

Vercel (scope **Production**, không phải Preview — cạm bẫy #11): `NEXT_PUBLIC_API_URL` (**có** `/api/v1`), `NEXT_PUBLIC_WS_URL` (**không** có), `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.

GitHub secrets (cho workflow backup): `PROD_DATABASE_URL` (phải là `DATABASE_PUBLIC_URL`), `R2_ENDPOINT`, `R2_BACKUP_ACCESS_KEY`, `R2_BACKUP_SECRET_KEY`.

### 3. Test restore — GATE, không pass thì không launch

**Backup chưa test restore thì coi như chưa có backup.**

- [ ] Chạy tay workflow `Backup Database` với environment `staging` (staging có data thật hơn prod lúc này).
- [ ] Restore vào DB scratch **Postgres 18** dùng một lần (DB dev trong docker-compose là PG16, không đọc được dump của pg_dump 18 — script sẽ chặn): `docker run -d --name pg-restore-test -e POSTGRES_HOST_AUTH_METHOD=trust -p 55432:5432 postgres:18-alpine` rồi `sh scripts/restore-db.sh "postgresql://postgres@localhost:55432/postgres"`.
- [ ] Xác nhận bản restore **dùng được**, đừng dừng ở "lệnh chạy xong": `prisma migrate status` báo up to date, số row các bảng chính khớp nguồn, boot backend trỏ vào DB scratch và đăng nhập được.
- [ ] Ghi ngày + kết quả vào `README.md`. Dọn DB scratch.

### 4. Cắt release

**Quy trình này dùng lại cho mọi release**, không riêng lần đầu. Luôn là **hai PR**, vì không được commit thẳng vào `develop`:

1. **PR chuẩn bị** vào `develop` — title `chore: prepare the vX.Y.Z release`. Bump `"version"` ở **ba** file `apps/backend/package.json`, `apps/web/package.json`, `packages/shared/package.json` (root `package.json` là `private`, **không có** field `version`), viết mục mới trong `CHANGELOG.md`, cập nhật `CLAUDE.md` + file này nếu trạng thái đổi. Merge khi cả 3 CI job xanh.
2. **PR release** `develop → main` — title `chore: release vX.Y.Z to production`.
   → **Chỉ chủ repo được merge vào `main`.** PR nhắm `main` **luôn** build Docker image thật (`ci-pr.yml` có `github.base_ref == 'main'` trong `SHOULD_BUILD`), đừng tin vào paths-filter.
   → Merge xong: Railway build + tự chạy `prisma migrate deploy` qua entrypoint (cạm bẫy #15 — đừng chạy tay), Vercel build production.

- [ ] Kiểm trước khi mở PR release: `git diff --name-only origin/main origin/develop -- apps/backend/prisma` — **rỗng nghĩa là release không có migration**, ghi rõ điều đó vào PR body để người merge biết mức rủi ro.
- [ ] Kiểm biến môi trường mới: `git diff origin/main origin/develop -- apps/backend/src/config/env.schema.ts` — có thay đổi thì **set biến trên Railway/Vercel TRƯỚC khi merge**, không thì backend crash lúc boot vì env validation.
- [ ] Tạo tag + GitHub Release `vX.Y.Z` trên `main` làm mốc rollback.

**Lịch sử release:**

| Version  | Ngày       | Ghi chú                                                                                    |
| -------- | ---------- | ------------------------------------------------------------------------------------------ |
| `v0.1.0` | 2026-08-01 | Launch production đầu tiên (PR #75, commit `7cc84ed`)                                      |
| `v0.2.0` | 2026-08-03 | QC responsive + kho nhạc + trang Cài đặt + i18n vi/en (PR #76–#93). Không có migration mới |

### 5. Bootstrap tài khoản đầu tiên

**KHÔNG seed demo lên prod** — `prisma:seed` tự từ chối khi `NODE_ENV=production`.

Set `BOOTSTRAP_ADMIN_EMAIL` + `BOOTSTRAP_ADMIN_PASSWORD` (>= 12 ký tự) trên Railway rồi (gộp **một chuỗi** sau `--`, kèm `MSYS_NO_PATHCONV=1` vì path bắt đầu bằng `/` — cạm bẫy #14):

```bash
MSYS_NO_PATHCONV=1 railway ssh -- "cd /app/apps/backend && node node_modules/ts-node/dist/bin.js prisma/bootstrap-admin.ts"
```

Không chạy được `ts-node` trong image thì chạy từ máy mình qua `DATABASE_PUBLIC_URL` (**không** `railway run` — cạm bẫy #15):

```bash
DB_URL=$(railway variables --service Postgres --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
DATABASE_URL="$DB_URL" BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=...   pnpm --filter @cafe-music/backend prisma:bootstrap
```

Idempotent. Xong thì đăng nhập, tạo store/user thật trên dashboard, rồi **xoá 2 biến bootstrap** khỏi env Railway.

### 6. Smoke test

Phần tự động hoá được (health check + rate limit login) có sẵn ở `scripts/smoke-staging.sh`:

```bash
BASE_URL=https://<railway-backend-domain>/api/v1 sh scripts/smoke-staging.sh
```

- [ ] `GET /api/v1/health` → 200; `GET /api/v1/health/ready` → 200 với `database` và `redis` đều `up`
- [ ] Đăng nhập từ web production được
- [ ] Sai mật khẩu 6 lần liên tiếp **cùng một email** → **429** (đếm theo tài khoản, không theo IP — đổi email giữa chừng là mỗi lần một counter)
- [ ] Ngay sau đó đăng nhập sai bằng **email khác** → vẫn `401`, không bị khoá lây
- [ ] Upload một file MP3 nhỏ → thấy object trong R2, phát được từ trình duyệt (kiểm chứng CORS của bucket)
- [ ] Mở 2 trình duyệt cùng **một quán** → WS kết nối không lỗi CORS, play/pause/next đồng bộ, số "màn hình đang kết nối" đúng
- [ ] Tài khoản ngoài tổ chức thử `join-store` quán khác → bị từ chối
- [ ] Log Railway ra JSON, có `req.id`, không chứa password/token
- [ ] Domain + HTTPS hoạt động
- [ ] Bắn một lỗi 5xx có chủ ý → issue hiện trong Sentry backend đúng `environment: production`, có mail alert
- [ ] Gây lỗi client → issue trong Sentry web, stack trace **đã un-minify** (chứng minh source map upload chạy)
- [ ] `curl -I` web production → security header của PR #15 còn nguyên sau khi bọc `withSentryConfig`
- [ ] Kiểm request `/auth/login` trong Sentry: body phải là `[redacted]`
- [ ] Workflow `Backup Database` chạy xanh với environment `production`, object mới nằm trong `cafe-music-backups`
- [ ] Chạy lại test restore (bước 3) một lượt với dump **của production**

**Rollback:** Railway redeploy image cũ từ history · Vercel instant rollback về deployment trước · tag `v0.1.0` làm mốc git · data hỏng thì restore bằng `scripts/restore-db.sh`. Rollback code **không** tự rollback database.

---

## Fast-follow (không chặn launch — quyết định sau)

| Việc                             | Khi nào cần                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Socket.IO Redis adapter          | **Bắt buộc** trước khi chạy ≥ 2 instance, nếu không trạng thái phát của quán bị split-brain. 5 cửa hàng / 1 instance thì chưa cần |
| Refresh token revocation         | Token 7 ngày hiện không thu hồi được. Nên làm trước khi có user thật                                                              |
| Upload streaming lên R2          | Hiện buffer tối đa 50MB vào RAM. Đủ dùng ở concurrency thấp                                                                       |
| Dùng `CDN_BASE_URL`              | Env đã có nhưng chưa consume — tối ưu chi phí/độ trễ                                                                              |
| Bật integration + E2E trong CI   | Scaffolding đã có, CI mới chạy unit test                                                                                          |
| Chặn `durationMs = 0` lúc upload | DB prod còn trống nên fix lúc nào cũng không cần backfill; hiện quán kẹt "đang phát" vô hạn                                       |

## Quyết định thiết kế đã chốt (đừng lật lại nếu không có lý do mới)

- **Giữ staging** dù chỉ ~5 cửa hàng: app chạy 24/7, không để bug release rơi thẳng vào khách.
- **Giữ Redis**: là cache trạng thái sync, code phụ thuộc cứng; Railway Redis rẻ + zero-ops; trạng thái "đang phát" sống sót qua mỗi lần redeploy (TTL 24h). Gỡ Redis là tối giản tuỳ chọn, không phải việc của lần launch đầu.
- **Dockerfile thay vì Nixpacks**: workspace pnpm cần build `@cafe-music/shared` trước backend và cần `prisma generate` — làm tay để build xác định.
- **Runner stage copy nguyên cây `/app`**: `node_modules` của pnpm là symlink vào `.pnpm` store, copy lẻ sẽ đứt liên kết. Đổi lại image còn dev dependency — chấp nhận được ở quy mô này.
