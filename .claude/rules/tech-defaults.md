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
| Lịch phát  | `store.organizationId`        | `PlaylistSchedule` không có org riêng — luôn lọc qua quán (`store: { organizationId }`)                                        |

`STORE_ADMIN` **được** upload và xoá track của quán mình, **không** xoá được track chung (`TracksService.scopeFor` + check trong `remove`). `SyncService.assertStoreAccess` chặn store admin thao tác quán khác.

## Sync engine — một luồng nhạc theo quán

**Quán (`Store`) là đơn vị phát.** Tầng `SyncGroup` đã bị bỏ (PR #54) vì trùng chức năng với quán — cùng với nó là toàn bộ khái niệm override / rejoin / `returnToGroupOnFinish`: không còn nhóm thì không có gì để tách ra hay quay về.

| Thành phần | Vị trí |
| ---------- | ------ |
| Điều khiển | `POST /sync/stores/:id/play\|pause\|resume\|next\|stop` (ORG_ADMIN + STORE_ADMIN của chính quán) |
| Room WS    | `store:<id>` |
| State      | Redis `store:<id>:playback` (TTL 24h) + cột `status`/`currentTrackId`/`trackIndex`/`startedAtTs` trên `Store` |

- **Chuyển bài do server lái**, không phải client. `startStoreTrack` hẹn `setTimeout` theo `track.durationMs`; hết playlist thì dừng hẳn (không loop). `onModuleInit` dựng lại timer sau restart theo thời lượng còn lại. Trước đây client bắt sự kiện `ended` rồi gọi `/next` — quán mở hai màn hình thì mỗi màn bắn một lệnh và nhạc nhảy cóc, còn không màn nào mở thì nhạc đứng im.
- **Giới hạn: timer nằm trong bộ nhớ process** → chỉ đúng khi chạy 1 instance backend. Scale nhiều instance phải chuyển sang khoá phân tán trên Redis.
- `pauseStore` huỷ timer (nếu không nhạc đang dừng vẫn tự nhảy bài) và gộp thời gian đã trôi vào `positionMs` để hydrate lúc đang dừng đọc đúng vị trí.
- Track có `durationMs = 0` (upload trước khi web biết đo thời lượng) → không auto-next được, UI hiện `--:--`.
- WS event: `store-now-playing` / `store-paused` / `store-stopped`. Client join `join-store`.
- Payload `store-now-playing` **kèm `track: WsTrackMeta` ({id,title,artist,durationMs})** để client dựng thanh phát mà không phải gọi thêm API — đừng chỉ gửi `trackId`.
- **Broadcast WS không replay khi join room.** Client mở trang sau lúc admin bấm phát phải gọi `GET /sync/stores/:id/now-playing` để hydrate — trả `NowPlayingSnapshot` với `positionMs` đã bù thời gian trôi. Thiếu bước này thì trang trắng tới lần chuyển bài kế.
- `SyncGateway.countStoreClients(storeId)` đếm client trong room `store:<id>` = số màn hình đang thực sự nghe. Trang chi tiết quán và `/sync/overview` hiện con số này để admin biết bấm phát xong có ai nghe không.

### Frontend

- `hooks/useSync.ts` **không tự lái audio**, nó đẩy vào `PlayerProvider` (`playTrack`/`pause`/`stop`); thanh phát dùng chung tự hiện. `PlayerMode` chỉ còn `'store'` (nhạc thật của quán) và `'preview'` (nghe thử tại chỗ).
- **Socket phải sống ở layout, không phải ở page.** `/store/**` dùng `components/sync/StoreSyncProvider.tsx` (mount ở `app/store/layout.tsx`), `/dashboard/**` dùng `components/sync/StoresSyncBridge.tsx` — mở **một socket con cho mỗi quán** của tổ chức. Đặt `useSync` bên trong một page thì rời page là socket chết, bấm phát vẫn trả 201 nhưng không có nhạc (bug PR #53).
- **Ai bấm phát ở đâu:** `/dashboard/stores/[id]` là chỗ **duy nhất** phát nhạc ra loa quán. `/dashboard/playlists` chỉ **nghe thử tại chỗ** (`mode: 'preview'`, chỉ tab đang bấm nghe). Console quán `/store/**` bấm phát = phát thật cho quán của chính họ.
- `PlayerProvider` giữ một "neo đồng bộ" (`positionMs` + `atLocalTs`): so track theo id để không reload audio khi cùng bài (URL presign lại mỗi lần), seek sau khi media sẵn sàng thay vì ngay lúc gán `src`, và tự chỉnh trôi trên `timeupdate` nếu lệch > 750ms — quán bấm dừng cục bộ rồi phát lại sẽ nhảy tới vị trí sống thay vì tiếp tục từ chỗ cũ.

## Auth — vô hiệu hoá tài khoản (`User.isActive`)

`User.isActive` (`Boolean @default(true)`) được `AuthService` (`apps/backend/src/modules/auth/auth.service.ts`) check ở **3 chỗ**: `login`, `refreshTokens`, và `validateJwtPayload` (`JwtStrategy` gọi mỗi request có JWT — quan trọng nhất, vì access token đang còn hạn của tài khoản vừa bị vô hiệu hoá cũng bị từ chối ngay ở request tiếp theo, không cần token blocklist). ORG_ADMIN đổi trạng thái qua `PATCH /users/:id { isActive }` — dùng chung route CRUD user đã có (đã scope theo `organizationId`), không có route riêng `/deactivate`. Frontend (`apps/web/src/lib/api-client.ts`) tự xoá token + redirect `/login` khi gặp `401` ngoài `/auth/login`.

## Bản đồ API (`/api/v1`)

| Nhóm       | Endpoint chính                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Auth       | `POST /auth/login`, `/auth/refresh`                                                                                                                                                        |
| Quán       | `POST /sync/stores/:id/play\|pause\|resume\|next\|stop` · `GET /sync/stores/:id/playback\|now-playing` · `GET /sync/overview` (ORG_ADMIN) · `GET /stores/:id` (chi tiết + đang phát + số màn hình) |
| Playlist   | `GET /playlists?scope=&q=&sort=` (trả kèm `totalDurationMs`) · CRUD `/playlists/:id` · `/playlists/:id/tracks[/reorder]`                                                                   |
| Folder     | `GET                                                                                                                                                                                       | POST                                                                                         | DELETE /folders`— **không phải**`/playlists/folders`, tách controller riêng để `@Get(':id')` không nuốt route |
| Track      | `GET                                                                                                                                                                                       | POST /tracks`(multipart kèm`durationMs`) · `GET /tracks/:id/stream-url`·`DELETE /tracks/:id` |
| Khác       | `/stores`, `/users`, `/schedules`, `/health`, `/health/ready`                                                                                                                              |

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
- **Docker Desktop trên Windows thỉnh thoảng treo** (`docker ps`/`docker info` không phản hồi, không timeout) — backend vẫn "chạy" nhưng không kết nối được DB/Redis rồi crash. Nhận ra bằng: lệnh `docker` bị treo quá vài giây. Fix: tắt hẳn `Docker Desktop.exe` + mọi process `docker*`/`com.docker.*` (lọc theo tên, không đụng process `node` khác), mở lại `Docker Desktop.exe`, đợi `docker info` trả lời rồi mới `docker compose up -d` và khởi động lại backend.
- **`next dev` có thể kẹt ở build cũ sau khi pull code mới** (chunk 404, MIME type sai khi load `.js`/`.css`) — dừng tiến trình `next dev` (lọc `CommandLine` chứa `next` + `dev`), `rm -rf apps/web/.next`, chạy lại `pnpm dev`.
- **Sau khi merge PR + `git checkout develop && git pull`, tạo nhánh mới NGAY trước khi sửa code tiếp** — dễ quên bước này giữa chuỗi nhiều PR liên tiếp và lỡ commit thẳng vào `develop`. Nếu lỡ commit mà CHƯA push (`git status` báo "ahead of origin"), sửa an toàn: `git branch <ten-nhanh-moi>` (giữ commit lại) → `git reset --hard origin/develop` (đưa `develop` local về đúng remote) → `git checkout <ten-nhanh-moi>`.
- **`railway ssh` trên Windows Git Bash âm thầm không chạy lệnh thật** — Git Bash tự dịch path Unix (`/app/...`) thành path Windows (set `MSYS_NO_PATHCONV=1` để tắt), và `railway ssh -- sh -c "..."` (nhiều tham số riêng) bị CLI nối lại làm mất ranh giới `-c`, remote chỉ chạy đúng từ đầu rồi thoát exit 0 không output. Gộp remote command thành **một chuỗi duy nhất** sau `--`, tránh khoảng trắng trong giá trị biến. Chi tiết đầy đủ + ví dụ ở [docs/PRODUCTION_READINESS.md](../../docs/PRODUCTION_READINESS.md) cạm bẫy #14.

## Yêu cầu tối thiểu

Node.js >= 20 LTS, pnpm >= 11, Python 3.x (dùng cho script skill `ui-ux-pro-max`, xem `.claude/rules/design.md`).
