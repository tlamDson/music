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

**Trên Railway migration chạy TỰ ĐỘNG — không phải làm tay.** `apps/backend/docker-entrypoint.sh` chạy `prisma migrate deploy` rồi mới `exec node dist/main`, nên mỗi lần container khởi động (deploy mới, restart, scale) schema tự được áp trước khi app mở cổng. Merge vào `develop` là staging tự migrate. Chi tiết + cách chạy tay khi cần: [docs/PRODUCTION_READINESS.md](../../docs/PRODUCTION_READINESS.md) cạm bẫy #15.

## Phạm vi dữ liệu theo vai trò

| Bảng       | Cột phạm vi                   | Ý nghĩa                                                                                                                        |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Track`    | `organizationId` + `storeId?` | `storeId = null` → kho chung của chuỗi; có giá trị → nhạc riêng của quán đó. `STORE_ADMIN` upload thì track tự gắn quán của họ |
| `Playlist` | `organizationId` + `scope`    | `scope = ORG` chỉ `ORG_ADMIN` sửa/xoá; `scope = STORE` gắn `storeId`                                                           |
| Lịch phát  | `store.organizationId`        | `PlaylistSchedule` không có org riêng — luôn lọc qua quán (`store: { organizationId }`)                                        |

`STORE_ADMIN` **được** upload và xoá track của quán mình, **không** xoá được track chung (`TracksService.scopeFor` + check trong `remove`). `SyncService.assertStoreAccess` chặn store admin thao tác quán khác.

## Sync engine — một luồng nhạc theo quán

**Quán (`Store`) là đơn vị phát.** Tầng `SyncGroup` đã bị bỏ (PR #54) vì trùng chức năng với quán — cùng với nó là toàn bộ khái niệm override / rejoin / `returnToGroupOnFinish`: không còn nhóm thì không có gì để tách ra hay quay về.

| Thành phần | Vị trí                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Điều khiển | `POST /sync/stores/:id/play\|pause\|resume\|next\|previous\|stop` · `PATCH /sync/stores/:id/playback-mode` (ORG_ADMIN + STORE_ADMIN của chính quán) |
| Room WS    | `store:<id>`                                                                                                                                        |
| State      | Redis `store:<id>:playback` (TTL 24h) + cột `status`/`currentTrackId`/`trackIndex`/`startedAtTs` trên `Store`                                       |

- **Chuyển bài do server lái**, không phải client. `startStoreTrack` hẹn `setTimeout` theo `track.durationMs`; hết playlist thì dừng hẳn (không loop) trừ khi `repeat: 'ALL'`. `onModuleInit` dựng lại timer sau restart theo thời lượng còn lại. Trước đây client bắt sự kiện `ended` rồi gọi `/next` — quán mở hai màn hình thì mỗi màn bắn một lệnh và nhạc nhảy cóc, còn không màn nào mở thì nhạc đứng im.
- **Giới hạn: timer nằm trong bộ nhớ process** → chỉ đúng khi chạy 1 instance backend. Scale nhiều instance phải chuyển sang khoá phân tán trên Redis.
- `pauseStore` huỷ timer (nếu không nhạc đang dừng vẫn tự nhảy bài) và gộp thời gian đã trôi vào `positionMs` để hydrate lúc đang dừng đọc đúng vị trí.
- Track có `durationMs = 0` (upload trước khi web biết đo thời lượng) → không auto-next được, UI hiện `--:--`.
- WS event: `store-now-playing` / `store-paused` / `store-stopped` / `store-mode-changed`. Client join `join-store`.
- Payload `store-now-playing` **kèm `track: WsTrackMeta` ({id,title,artist,durationMs})** cùng `repeat`/`shuffle` để client dựng thanh phát mà không phải gọi thêm API — đừng chỉ gửi `trackId`.
- **Broadcast WS không replay khi join room.** Client mở trang sau lúc admin bấm phát phải gọi `GET /sync/stores/:id/now-playing` để hydrate — trả `NowPlayingSnapshot` (`playlistId` + `repeat`/`shuffle` + `positionMs` đã bù thời gian trôi). Thiếu bước này thì trang trắng tới lần chuyển bài kế.
- `SyncGateway.countStoreClients(storeId)` đếm client trong room `store:<id>` = số màn hình đang thực sự nghe. Trang chi tiết quán và `/sync/overview` hiện con số này để admin biết bấm phát xong có ai nghe không.

### Lặp lại / phát ngẫu nhiên / bài trước (PR #2 nâng cấp phát nhạc)

`StorePlaybackState` (`packages/shared/src/types/index.ts`) thêm ba field:

- `order: number[]` — hoán vị chỉ số vào `trackIds`. **`trackIds` luôn giữ đúng thứ tự playlist gốc**, `trackIndex` là vị trí trong `order` chứ không phải chỉ số trực tiếp vào `trackIds`. Tắt shuffle chỉ cần đặt `order` về `[0..n)` là quay lại thứ tự gốc ngay, không phải gọi lại DB. `SyncService.trackIdAt(playback, pos)` là nơi duy nhất tra `trackIds[order[pos]]` — mọi chỗ đọc "bài ở vị trí X" trong service đều phải qua đây, không suy ra thẳng bằng `trackIds[trackIndex]`.
- `repeat: 'OFF' | 'ALL' | 'ONE'` — `ONE` chỉ ảnh hưởng **auto-next** trong `advance()` (timer server): phát lại đúng bài đang phát. `ALL` áp dụng cho **cả** auto-next và next thủ công: hết hàng chờ thì quay về đầu (auto-next xáo lại `order` nếu đang shuffle).
- **`nextStore` ở bài cuối là no-op**, trả `{ finished: true, playback }` và **không** gọi `stopStore()`: giữ nguyên nhạc + state Redis. Nó từng dừng hẳn quán ở đây, nên bấm "Bài kế tiếp" ở bài cuối làm thanh phát biến mất và mất luôn ngữ cảnh playlist (bug QC "tự out khỏi playlist"). Dừng hẳn khi hết hàng chờ chỉ đúng trong `advance()` — ở đó bài cuối đã phát xong thật, còn lệnh thủ công thì chưa.
- **UI bỏ nút hẳn ở hai đầu hàng chờ**, không chỉ làm mờ: `TransportControls` và `StoreDetail` ẩn "Bài trước" khi `queue.index === 0` và "Bài kế tiếp" khi `queue.remaining === 0`, trừ khi `repeat === 'ALL'` (hàng chờ thành vòng tròn nên hai đầu lại đi được). Nghe thử (`mode: 'preview'`, `queue === null`) vẫn render nhưng `disabled` kèm `title` giải thích.
- `shuffle: boolean` — bật giữa chừng (`setPlaybackMode`) xáo lại `order` nhưng **đặt bài đang phát lên vị trí đầu** rồi `trackIndex = 0`, nhạc đang chạy không nhảy ngang. Tắt shuffle thì `order` về `[0..n)`, `trackIndex` trỏ lại đúng vị trí gốc của bài đang phát.

`POST /sync/stores/:id/previous` giống Spotify: đã phát > 3s thì tua về đầu bài hiện tại, chưa tới 3s thì lùi một bậc trong `order`; đang ở bài đầu thì `ALL` nhảy về bài cuối, còn lại tua về đầu bài đó. `PATCH /sync/stores/:id/playback-mode` (`{ repeat?, shuffle? }`, cả hai optional) đổi mode **không làm gián đoạn nhạc** — chỉ ghi lại state + broadcast `store-mode-changed`, không gọi `startStoreTrack`.

**Tương thích ngược bắt buộc:** state cũ trong Redis (ghi trước PR này) không có `order`/`repeat`/`shuffle`. Chuẩn hoá **một chỗ duy nhất** trong `RedisService.getStorePlayback` — thiếu thì mặc định `order = trackIds.map((_, i) => i)`, `repeat: 'OFF'`, `shuffle: false`. `SyncService` không rải `??` phòng thủ ở nơi khác, vì mọi state đọc ra từ đây đã được đảm bảo đủ field.

### Frontend

- `hooks/useSync.ts` **không tự lái audio**, nó đẩy vào `PlayerProvider` (`playTrack`/`pause`/`stop`); thanh phát dùng chung tự hiện. `PlayerMode` chỉ còn `'store'` (nhạc thật của quán) và `'preview'` (nghe thử tại chỗ).
- **Socket phải sống ở layout, không phải ở page.** `/store/**` dùng `components/sync/StoreSyncProvider.tsx` (mount ở `app/store/layout.tsx`), `/dashboard/**` dùng `components/sync/StoresSyncBridge.tsx`. Đặt `useSync` bên trong một page thì rời page là socket chết, bấm phát vẫn trả 201 nhưng không có nhạc (bug PR #53).
- **Một tab chỉ nghe MỘT quán.** `StoresSyncBridge` mở đúng một socket, cho quán mà URL đang mở (`focusedStoreIdFrom(pathname)` khớp `/dashboard/stores/<id>`); các trang dashboard khác không mở socket nào và không phát tiếng. Nó **từng** mở một socket cho mỗi quán của tổ chức (fetch `GET /stores`) — cả app chỉ có **một** thẻ audio nên quán nào bắn `store-now-playing` cũng cướp được nó, và một store admin đổi bài ở quán mình làm tab org admin nhảy sang bài đó. Đừng fan-out lại.
- **Lệnh dừng từ WS phải đi qua `pauseStore(storeId)` / `stopStore(storeId)`**, không phải `pause()`/`stop()` trần — hai hàm scoped này tự no-op khi thẻ audio đang phát nhạc của quán khác (hoặc đang nghe thử). `useSync` cũng bỏ qua mọi payload có `payload.storeId` khác quán mình cho cả 4 event. Đây là lớp chặn thứ hai để lỗi trên không tái phát.
- **Ai bấm phát ở đâu:** `/dashboard/stores/[id]` là chỗ **duy nhất** phát nhạc ra loa quán. `/dashboard/playlists` chỉ **nghe thử tại chỗ** (`mode: 'preview'`, chỉ tab đang bấm nghe). Console quán `/store/**` bấm phát = phát thật cho quán của chính họ.
- `PlayerProvider` giữ một "neo đồng bộ" (`positionMs` + `atLocalTs`): so track theo id để không reload audio khi cùng bài (URL presign lại mỗi lần), seek sau khi media sẵn sàng thay vì ngay lúc gán `src`, và tự chỉnh trôi trên `timeupdate` nếu lệch > 750ms — quán bấm dừng cục bộ rồi phát lại sẽ nhảy tới vị trí sống thay vì tiếp tục từ chỗ cũ.

## Auth — vô hiệu hoá tài khoản (`User.isActive`)

`User.isActive` (`Boolean @default(true)`) được `AuthService` (`apps/backend/src/modules/auth/auth.service.ts`) check ở **3 chỗ**: `login`, `refreshTokens`, và `validateJwtPayload` (`JwtStrategy` gọi mỗi request có JWT — quan trọng nhất, vì access token đang còn hạn của tài khoản vừa bị vô hiệu hoá cũng bị từ chối ngay ở request tiếp theo, không cần token blocklist). ORG_ADMIN đổi trạng thái qua `PATCH /users/:id { isActive }` — dùng chung route CRUD user đã có (đã scope theo `organizationId`), không có route riêng `/deactivate`. Frontend (`apps/web/src/lib/api-client.ts`) tự xoá token + redirect `/login` khi gặp `401` ngoài `/auth/login`.

## Rate limit — counter ở Redis, định danh client theo header của edge

`ThrottlerModule` được cấu hình ở [app.module.ts](../../apps/backend/src/app.module.ts) qua `forRootAsync`, **không** dùng mặc định của `@nestjs/throttler`:

- **Storage**: `RedisThrottlerStorage` (`src/common/throttler/`) — đếm bằng một script Lua `INCR` + `PEXPIRE` (chỉ đặt hạn ở hit đầu, nếu không cửa sổ bị đẩy lùi mãi và không bao giờ đóng), key prefix `throttle:` tách khỏi `store:*`. Mặc định của thư viện giữ counter trong `Map` của process → mất sạch mỗi lần Railway thay container và mỗi instance đếm riêng.
- **Tracker**: `clientIpTracker` đọc `x-envoy-external-address` (edge của Railway đặt), fallback `req.ip`. **Không** đọc entry trái nhất của `X-Forwarded-For` — client gửi header đó lên được, xoay giá trị là thoát rate limit.
- **Vì sao**: `main.ts` set `trust proxy: 1` nên Express suy `req.ip` bằng cách trừ **đúng một** hop khỏi XFF; chuỗi proxy của Railway không cố định độ dài nên cùng một client ra hai `req.ip` khác nhau → hai key → counter reset giữa chừng. Đo thật trên staging trước khi sửa: `X-RateLimit-Remaining` chạy 4,3,2,1 rồi **nhảy lại 4**, 8 lần login sai liên tiếp vẫn không ra `429`; `X-RateLimit-Reset` trả 38 rồi 39 — hai cửa sổ đếm song song cho cùng một client.
- **Cách kiểm tra lại** (không cần deploy log tạm): curl `/auth/login` nhiều lần rồi đọc header `X-RateLimit-Remaining` — phải giảm đều tới 0 rồi `429`, không được nhảy ngược lên.
- `blockDuration` cố tình không hiện thực hoá: repo chỉ dùng `ttl` + `limit`.

## Error tracking — Sentry

- **Backend**: `src/instrument.ts` gọi `Sentry.init`, được import ở **dòng đầu tiên** của `main.ts` (trước cả `AppModule` — Sentry vá thư viện lúc chúng được require, nạp sau thì instrumentation không gắn được).
- **Chỉ 5xx mới lên Sentry**, quyết định trong `AllExceptionsFilter` (dùng lại filter đã có, **không** thêm `SentryGlobalFilter`). Gửi cả 4xx sẽ đốt hết quota free tier bằng 401/404/429 vốn là traffic bình thường.
- **`SENTRY_ENVIRONMENT` là bắt buộc khi có DSN** — staging và production **đều** chạy `NODE_ENV=production`, thiếu nó thì hai môi trường trộn lẫn và không biết lỗi từ đâu.
- Không có DSN (local, CI, test) → không init, app chạy bình thường. Vì thế `SENTRY_DSN` optional trong `env.schema.ts`.
- **Web**: `instrumentation.ts` (server + `onRequestError`) + `instrumentation-client.ts` + **`app/global-error.tsx`** — thiếu file cuối thì lỗi React render (component crash, đúng loại QC hay gặp) không bao giờ tới Sentry.
- `next.config.ts` bọc bằng `withSentryConfig`. **Security header của PR #15 phải còn nguyên sau khi bọc** — đã kiểm chứng là `withSentryConfig` giữ lại `headers()`, nhưng vẫn `curl -I` sau mỗi lần deploy.
- Body của `/auth/login` + `/auth/refresh` bị redact trong `beforeSend` (`scrubAuthPayloads`) — pino đã redact credential, Sentry phải giữ cùng mức, không để credential rời server qua đường thứ hai.
- Không bật tracing (`tracesSampleRate: 0`) và không bật Session Replay: quota free tier tính cả transaction/replay, mà thứ cần ở đây là lỗi.

## Backup database

Hai lớp, vì snapshot của Railway nằm **cùng account** với DB — mất account là mất luôn backup:

| Lớp                       | Chạy bằng                                       |
| ------------------------- | ----------------------------------------------- |
| Snapshot Railway          | Bật trong dashboard, hằng ngày                  |
| `pg_dump` → R2 (off-site) | `.github/workflows/backup-db.yml`, 01:00 giờ VN |

- `scripts/backup-db.sh` **fail nếu dump nhỏ bất thường** — backup lỗi âm thầm là cái bẫy kinh điển, thà để job đỏ và có mail.
- `pg_dump` phải **>= major version của server** (Railway đang chạy **Postgres 18**) — client cũ hơn sẽ từ chối dump. Workflow vì thế chạy trong container `postgres:18-alpine`.
- `DATABASE_URL` cho backup phải là **`DATABASE_PUBLIC_URL`** — bản nội bộ trỏ `*.railway.internal` chỉ resolve trong mạng Railway.
- `scripts/restore-db.sh` từ chối chạy nếu URL đích trông giống database trên Railway (script ghi đè schema — chỉ dùng cho DB scratch).

## Bản đồ API (`/api/v1`)

| Nhóm     | Endpoint chính                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Auth     | `POST /auth/login`, `/auth/refresh`                                                                                                                                                                                                                   |
| Quán     | `POST /sync/stores/:id/play\|pause\|resume\|next\|previous\|stop` · `PATCH /sync/stores/:id/playback-mode` · `GET /sync/stores/:id/playback\|now-playing` · `GET /sync/overview` (ORG_ADMIN) · `GET /stores/:id` (chi tiết + đang phát + số màn hình) |
| Playlist | `GET /playlists?scope=&q=&sort=` (trả kèm `totalDurationMs`) · CRUD `/playlists/:id` · `/playlists/:id/tracks[/reorder]`                                                                                                                              |
| Folder   | `GET                                                                                                                                                                                                                                                  | POST                                                                                         | DELETE /folders`— **không phải**`/playlists/folders`, tách controller riêng để `@Get(':id')` không nuốt route |
| Track    | `GET                                                                                                                                                                                                                                                  | POST /tracks`(multipart kèm`durationMs`) · `GET /tracks/:id/stream-url`·`DELETE /tracks/:id` |
| Khác     | `/stores`, `/users`, `/schedules`, `/health`, `/health/ready`                                                                                                                                                                                         |

## Frontend — quy ước dùng chung

- **Một thẻ audio duy nhất** cho cả app: `components/player/PlayerProvider.tsx`, thanh phát `PlayerBar` gắn ở layout gốc. Đừng tạo `new Audio()` trong trang.
- **`usePlayer()` (state ổn định) vs `usePlayerPosition()` (vị trí phát) — không gộp lại.** `usePlayer()` trả `current`/`isPlaying`/`durationMs`/`volume`/`mode`/`storeId`/`queue` + action, đổi vài lần mỗi phút; `usePlayerPosition()` trả riêng `positionMs`, cập nhật bằng vòng lặp `requestAnimationFrame` (không phải mỗi `timeupdate`) qua một store nhỏ ngoài React (`useSyncExternalStore`). Trước đây `positionMs` nằm chung context với phần còn lại — mỗi `timeupdate` (vài lần/giây) làm object context đổi identity, kéo theo **mọi** consumer của `usePlayer()` re-render kể cả nơi chỉ đọc `current`/`queue` (bảng track, nút play, `useSync`,...), gây lag khi đang phát nhạc trên trang có bảng dài. Chỉ `PlayerBar` và `/player/[storeId]` cần vị trí thật — gọi `usePlayerPosition()`; 6 nơi còn lại giữ nguyên `usePlayer()`, không cần sửa gì để hết bị kéo theo.
- Menu theo vai trò lấy từ `lib/nav.ts` (`dashboardNavItems` / `storeNavItems` / `homePathFor`) — không viết tay danh sách nav trong layout.
- Thời lượng: `formatDuration` (0 = chưa biết → `--:--`), `formatPosition` (0 = `0:00`), `formatTotalDuration` ("khoảng 7 giờ").
- DB chưa có ảnh bìa → `components/media/CoverArt.tsx` sinh bìa từ id bằng palette design system.
- `/player/[storeId]?kiosk=1` = màn chiếu TV, không render nút điều khiển nào.

### Bộ nút thanh phát + màn "Đang phát" toàn màn hình

- **`repeat`/`shuffle` sống trong `PlayerProvider`, không phải `StoreSyncProvider`.** `PlayerBar` mount ở root layout (`app/layout.tsx`), là **anh em** (sibling) với `{children}` chứ không phải con của `StoreSyncProvider`/`StoresSyncBridge` (những cái đó nằm trong `{children}` của `/store` hay `/dashboard` layout) — nên `PlayerBar` **không đọc được** context của chúng qua `useStoreSync()`. `useSync()` đẩy repeat/shuffle vào `PlayerProvider` qua `playTrack(track, { repeat, shuffle })` (theo `store-now-playing`) và `setPlaybackMode({ repeat, shuffle })` (theo `store-mode-changed`, không kèm track nên không gọi `playTrack` lại — đổi mode không được làm gián đoạn nhạc). `StoreSyncProvider` **vẫn** forward `playlistId`/`repeat`/`shuffle` qua context của nó cho các trang con khác trong `/store` cần đọc mà không muốn phụ thuộc `PlayerProvider` trực tiếp.
- **Nghe thử (`mode: 'preview'`) không gọi API sync** — `shuffle`/bài trước/bài sau bị `disabled` kèm `title` tiếng Việt giải thích lý do (không có hàng chờ). Riêng repeat vẫn bấm được, đổi cục bộ 2 trạng thái `OFF ⇄ ONE` qua `togglePreviewRepeat()` — set thẳng `audio.loop`, không qua server. Ở `mode: 'store'`, repeat đi đủ vòng 3 trạng thái `OFF → ALL → ONE → OFF`, mỗi bước là một `PATCH /sync/stores/:id/playback-mode` — **không tự cập nhật UI ngay**, chờ broadcast `store-mode-changed` xác nhận (quán mở hai màn hình phải thấy cùng một trạng thái).
- `components/player/TransportControls.tsx` là cụm shuffle · trước · play/pause · sau · repeat dùng chung cho cả `PlayerBar` (nhỏ) và `NowPlayingOverlay` (to, `size="lg"`) — sửa logic một chỗ, cả hai nơi cùng đổi theo.
- `components/player/NowPlayingOverlay.tsx` mở bằng `element.requestFullscreen()` thật (không phải overlay CSS suông) và đồng bộ đóng/mở qua sự kiện `fullscreenchange` của `document`, không chỉ dựa vào state React — người dùng thoát fullscreen bằng ESC/F11 của trình duyệt (không qua nút Đóng của mình) vẫn phải đóng được overlay, nếu không kẹt UI.
- `components/player/MarqueeText.tsx`: tên bài dài chạy marquee khi hover bằng CSS thuần (`<style jsx>` — Next.js có sẵn styled-jsx, không cần cài thêm) — nhân đôi chữ trong track rồi trượt 50% khi hover, cố tình không đo bề rộng chữ bằng JS.

## Tài khoản (không có endpoint đăng ký công khai)

| Lệnh               | Dùng cho        | Ghi chú                                                                                                                                           |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma:seed`      | local + staging | Dữ liệu demo (1 org, 1 org admin, 3 store). Mật khẩu từ `SEED_ADMIN_PASSWORD` / `SEED_STORE_PASSWORD`; **từ chối chạy** khi `NODE_ENV=production` |
| `prisma:bootstrap` | production      | Tạo đúng 1 org + 1 `ORG_ADMIN` từ `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (>= 12 ký tự), không có demo data. Idempotent              |

## Deploy & vận hành

Vercel (web) · Railway (backend + Postgres + Redis) · Cloudflare R2 (track). Trạng thái, biến môi trường và checklist đầy đủ: **[docs/PRODUCTION_READINESS.md](../../docs/PRODUCTION_READINESS.md)**.

- **Migration tự chạy lúc container khởi động** qua `docker-entrypoint.sh` — deploy xong không cần chạy `migrate deploy` tay (xem mục _Database_).
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
- **`jest` chạy trong worktree agent nằm dưới thư mục `.claude/worktrees/<id>` báo "No tests found" cho MỌI file, kể cả file không đổi gì** — bug của `jest-util`'s `replacePathSepForGlob`: khi rootDir tuyệt đối chứa một segment bắt đầu bằng dấu chấm (`.claude`), hàm né không đổi đúng một dấu `\` (cái đứng ngay trước `.`) từ backslash sang forward-slash vì tưởng đó là ký tự escape glob, sinh ra pattern lẫn lộn dấu phân cách không khớp được path thật. Không sửa được bằng cách đổi `jest.config.ts` (rootDir tuyệt đối vẫn luôn chứa `.claude`) hay dùng NTFS junction trỏ ra ngoài (Jest gọi `realpath` nên vẫn ra lại path thật). Cách né duy nhất: copy toàn bộ working tree (trừ `node_modules`, `.git`) ra một path KHÔNG có thư mục nào bắt đầu bằng dấu chấm (vd `D:\some-clean-path`), `pnpm install` + `pnpm --filter @cafe-music/shared build` + `pnpm --filter @cafe-music/backend exec prisma generate` lại trong bản copy đó rồi chạy test ở đó. Nhớ dọn thư mục copy sau khi xong — **và luôn dùng ổ đĩa còn nhiều dung lượng trống** (từng làm ổ `C:` cạn sạch chỉ còn vài trăm KB khi copy + cài đặt vào một ổ gần đầy).
- **`overrides` của pnpm nằm trong `pnpm-workspace.yaml`, KHÔNG phải `package.json`** (pnpm 11) — đặt nhầm chỗ thì bị bỏ qua âm thầm, install vẫn lỗi y như cũ. Hiện có một override: `import-in-the-middle: 3.2.0`, vì bản 3.3.x khai báo phụ thuộc `es-module-lexer: ^2.2.0` — một version **chưa từng được publish** — làm cả cây phụ thuộc của `@sentry/*` không cài được. Gỡ override khi upstream sửa.
- **`eslint`/`tsc` báo hàng loạt `no-unsafe-member-access`/`Cannot find module '@cafe-music/shared'` dù code không sai** — do `@prisma/client` chưa được generate (cần `pnpm --filter @cafe-music/backend exec prisma generate`) hoặc `packages/shared` chưa build (`pnpm --filter @cafe-music/shared build`, vì `main`/`types` trỏ vào `dist/`). Thấy lỗi type lan ra cả những file không liên quan tới thay đổi của mình thì kiểm tra hai bước này trước khi nghi ngờ code.

## Yêu cầu tối thiểu

Node.js >= 20 LTS, pnpm >= 11, Python 3.x (dùng cho script skill `ui-ux-pro-max`, xem `.claude/rules/design.md`).
