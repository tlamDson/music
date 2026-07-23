# Tech Defaults — Cafe Music

Nền tảng phát nhạc đồng bộ cho chuỗi quán cafe. Monorepo TypeScript (pnpm + Turborepo).

## Kiến trúc

| App/Package | Path              | Stack                                           | Vai trò                                                                                                                           |
| ----------- | ----------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Backend     | `apps/backend`    | NestJS 11, Prisma 6, Redis (ioredis), Socket.IO | API `/api/v1` (port 4000), modules: auth, organizations, stores, users, tracks, playlists, sync, scheduler                        |
| Web         | `apps/web`        | Next.js App Router                              | `dashboard/*` (console chuỗi — ORG_ADMIN), `store/*` (console quán — STORE_ADMIN), `player/[storeId]` (màn phát nhạc) — port 3000 |
| Shared      | `packages/shared` | Zod schemas, types, constants                   | Dùng chung backend/web                                                                                                            |

Chi tiết setup/local dev đầy đủ: `docs/DEVELOPER_GUIDE.md`.

## Hạ tầng dev (`docker-compose.yml`)

| Service           | URL/Port                                  | Mục đích                                    |
| ----------------- | ----------------------------------------- | ------------------------------------------- |
| PostgreSQL        | `localhost:5432`                          | Database chính                              |
| PostgreSQL (test) | `localhost:5433`                          | Integration tests (tmpfs)                   |
| Redis             | `localhost:6379`                          | Sync state, pub/sub                         |
| MinIO             | `http://localhost:9000` (console `:9001`) | S3-compatible storage cho track self-hosted |

```bash
docker compose up -d
pnpm install
pnpm dev              # tất cả apps qua turbo
curl http://localhost:4000/api/v1/health
```

**Backend không boot được nếu Docker chưa chạy** — env validation (Zod, `src/config/env.schema.ts`) crash ngay lúc khởi động khi thiếu biến hoặc không kết nối được DB. Thấy backend không lên thì kiểm tra Docker trước tiên.

## Database — dùng migrations, KHÔNG dùng `db push`

Schema đã baseline ở `apps/backend/prisma/migrations/20260722000000_init`.

```bash
pnpm --filter @cafe-music/backend exec prisma migrate deploy   # dựng DB mới
pnpm --filter @cafe-music/backend exec prisma migrate dev --name <mo-ta>  # đổi schema
```

DB cũ từng tạo bằng `db push` → chạy một lần: `prisma migrate resolve --applied 20260722000000_init`.

## Phạm vi dữ liệu theo vai trò

| Bảng       | Cột phạm vi                   | Ý nghĩa                                                                                                                        |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Track`    | `organizationId` + `storeId?` | `storeId = null` → kho chung của chuỗi; có giá trị → nhạc riêng của quán đó. `STORE_ADMIN` upload thì track tự gắn quán của họ |
| `Playlist` | `organizationId` + `scope`    | `scope = ORG` chỉ `ORG_ADMIN` sửa/xoá; `scope = STORE` gắn `storeId`                                                           |
| Sync       | `syncGroup.organizationId`    | Lịch phát (`PlaylistSchedule`) không có org riêng — luôn lọc qua sync group                                                    |

`STORE_ADMIN` **được** upload và xoá track của quán mình, **không** xoá được track chung (`TracksService.scopeFor` + check trong `remove`). `SyncService.assertStoreAccess` chặn store admin thao tác quán khác.

## Sync engine — hai luồng nhạc song song

| Luồng               | Ai điều khiển                                                         | Room WS           | State                         |
| ------------------- | --------------------------------------------------------------------- | ----------------- | ----------------------------- |
| Nhóm sync           | ORG_ADMIN (`/sync/groups/:id/play\|pause\|skip`)                      | `sync-group:<id>` | Redis `sync-group:<id>:state` |
| Nhạc riêng của quán | Quán đó hoặc ORG_ADMIN (`/sync/stores/:id/play\|pause\|resume\|next`) | `store:<id>`      | Redis `store:<id>:playback`   |

- Quán bấm phát = **tự override** (tách khỏi nhóm). Hết hàng chờ riêng, mặc định `returnToGroupOnFinish` đưa quán về nhóm và **bắt kịp đúng vị trí giây** của bài nhóm đang phát (`positionMs` bù theo `startedAtServerTs`).
- Backend **tự chuyển bài** cho nhóm bằng `setTimeout` theo `track.durationMs`; hết playlist thì dừng hẳn (không loop). `onModuleInit` dựng lại timer sau restart.
- **Giới hạn: timer nằm trong bộ nhớ process** → chỉ đúng khi chạy 1 instance backend. Scale nhiều instance phải chuyển sang khoá phân tán trên Redis.
- Track có `durationMs = 0` (upload trước khi web biết đo thời lượng) → không auto-next được, UI hiện `--:--`.
- WS event: `now-playing` / `paused` / `stopped` (nhóm) · `store-now-playing` / `store-paused` / `store-stopped` (quán). Client join `join-group` + `join-store`.

## Bản đồ API (`/api/v1`)

| Nhóm       | Endpoint chính                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Auth       | `POST /auth/login`, `/auth/refresh`                                                                                                      |
| Sync group | `GET                                                                                                                                     | POST /sync/groups`·`POST /sync/groups/:id/play\|pause\|skip`·`GET /sync/groups/:id/state`    |
| Quán       | `POST /sync/stores/:id/play\|pause\|resume\|next\|override\|rejoin` · `GET /sync/stores/:id/playback` · `GET /sync/overview` (ORG_ADMIN) |
| Playlist   | `GET /playlists?scope=&q=&sort=` (trả kèm `totalDurationMs`) · CRUD `/playlists/:id` · `/playlists/:id/tracks[/reorder]`                 |
| Folder     | `GET                                                                                                                                     | POST                                                                                         | DELETE /folders`— **không phải**`/playlists/folders`, tách controller riêng để `@Get(':id')` không nuốt route |
| Track      | `GET                                                                                                                                     | POST /tracks`(multipart kèm`durationMs`) · `GET /tracks/:id/stream-url`·`DELETE /tracks/:id` |
| Khác       | `/stores`, `/users`, `/schedules`, `/health`, `/health/ready`                                                                            |

## Frontend — quy ước dùng chung

- **Một thẻ audio duy nhất** cho cả app: `components/player/PlayerProvider.tsx`, thanh phát `PlayerBar` gắn ở layout gốc. Đừng tạo `new Audio()` trong trang.
- Menu theo vai trò lấy từ `lib/nav.ts` (`dashboardNavItems` / `storeNavItems` / `homePathFor`) — không viết tay danh sách nav trong layout.
- Thời lượng: `formatDuration` (0 = chưa biết → `--:--`), `formatPosition` (0 = `0:00`), `formatTotalDuration` ("khoảng 7 giờ").
- DB chưa có ảnh bìa → `components/media/CoverArt.tsx` sinh bìa từ id bằng palette design system.
- `/player/[storeId]?kiosk=1` = màn chiếu TV, không render nút điều khiển nào.

## Tài khoản (không có endpoint đăng ký công khai)

| Lệnh               | Dùng cho        | Ghi chú                                                                                                                                           |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma:seed`      | local + staging | Dữ liệu demo (1 org, 1 org admin, 3 store). Mật khẩu từ `SEED_ADMIN_PASSWORD` / `SEED_STORE_PASSWORD`; **từ chối chạy** khi `NODE_ENV=production` |
| `prisma:bootstrap` | production      | Tạo đúng 1 org + 1 `ORG_ADMIN` từ `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (>= 12 ký tự), không có demo data. Idempotent              |

## Deploy & vận hành

Vercel (web) · Railway (backend + Postgres + Redis) · Cloudflare R2 (track). Trạng thái, biến môi trường và checklist đầy đủ: **[docs/PRODUCTION_READINESS.md](../../docs/PRODUCTION_READINESS.md)**.

- Health: `/api/v1/health` (liveness — Railway probe cái này) và `/api/v1/health/ready` (DB + Redis, để chẩn đoán).
- Log: pino — JSON ở production, pretty ở dev, có request id, tự redact credential. Chỉnh mức log bằng `LOG_LEVEL`.

## Cạm bẫy hay gặp

- **turbo cần tên package đầy đủ scope**, pnpm thì không:
  `turbo --filter=@cafe-music/backend` ✅ · `turbo --filter=backend` ❌ · `pnpm --filter backend` ✅
- **Đừng `Stop-Process -Name node` bừa trên Windows** — Docker Desktop cũng chạy Node, giết hết là Docker sập. Lọc theo `CommandLine`.
- `tsconfig.build.json` cố định `"include": ["src/**/*"]` — kéo thêm `prisma/` vào sẽ đẩy output thành `dist/src/main.js` và `start:prod` (`node dist/main`) hỏng.
- **`prisma generate` báo `EPERM` khi backend dev đang chạy** — `nest start --watch` giữ `query_engine-windows.dll.node`. Dừng đúng tiến trình backend (lọc `CommandLine` chứa `nest.js` / `dist\main`) rồi generate, xong bật lại.
- **Đừng chạy `pnpm turbo lint typecheck build` một lệnh ở local** — `next build` xoá `.next/types/**` trong lúc `tsc --noEmit` đang đọc (tsconfig của web include thư mục đó) nên hỏng ngẫu nhiên ~1/3 lần. Chạy từng lệnh một; CI không dính vì 3 job tách rời.
- **Xoá một route Next rồi typecheck đỏ** vì `.next/types` cũ còn sót → `rm -rf apps/web/.next` một lần.
- **Zod `.default()` làm field thành bắt buộc trong type sau parse** (`z.infer`) — service nhận DTO đó sẽ bắt mọi call site phải truyền. Muốn giữ optional cho client cũ thì dùng `.optional()` + fallback trong service.
- **Route Nest ăn nhau theo thứ tự khai báo**: `@Get(':id')` đặt trước `@Get('/folders')` sẽ nuốt luôn `/folders`. Prefix tĩnh phải khai báo trước, hoặc tách controller riêng.

## Yêu cầu tối thiểu

Node.js >= 20 LTS, pnpm >= 11, Python 3.x (dùng cho script skill `ui-ux-pro-max`, xem `.claude/rules/design.md`).
