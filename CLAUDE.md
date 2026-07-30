# Cafe Music — Claude Code Project Instructions

Nền tảng phát nhạc đồng bộ cho chuỗi quán cafe. Monorepo TypeScript (pnpm + Turborepo): NestJS backend, Next.js web, shared packages. Chi tiết setup/local dev: [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

Các rule chi tiết dưới đây áp dụng luôn, không chỉ khi được hỏi:

@.claude/rules/tech-defaults.md
@.claude/rules/workflow.md
@.claude/rules/design.md

## Quy tắc bắt buộc (không được vi phạm)

- **Mọi thay đổi đi qua PR** — không commit thẳng vào `develop`/`main`. Tạo nhánh → commit → push → mở PR vào `develop`.
- **`main` do chủ repo quản lý** — Claude không merge, không push vào `main`.
- **Chỉ merge vào `develop` khi CI + test pass hết** — phải xanh **cả 3 job**: `Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build`.
- **Cập nhật `CLAUDE.md` + `.claude/rules/*`** khi task làm thay đổi convention, tooling hay quy trình.
- **Sửa bug quan sát được qua trình duyệt phải verify bằng MCP `chrome-devtools` cả trước lẫn sau khi fix** — không báo "đã fix" nếu chưa tái hiện lại thao tác gây bug sau khi sửa. Chi tiết: [.claude/rules/workflow.md](.claude/rules/workflow.md) mục _Debug bug_.

Chi tiết merge policy: [.claude/rules/workflow.md](.claude/rules/workflow.md).

## Trạng thái dự án

Đang chuẩn bị release production đầu tiên (`v0.1.0`). **Phase 0 (code readiness) và Phase 1 (staging) đã xong** — staging đang chạy live trên Railway (backend + Postgres + Redis) + Vercel (web, nhánh `develop`) + Cloudflare R2 (track), đã verify end-to-end (login → dashboard). Xem [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) để biết chi tiết domain/trạng thái, đã làm gì, còn nợ gì (kể cả nợ đang mở: rate limit login không nhất quán trên Railway, cần điều tra trước khi có user thật) và bước tiếp theo (Phase 2 — production). Đọc file đó trước khi bắt tay vào việc liên quan deploy/staging/release.

**Deploy staging là tự động, kể cả migration.** Merge vào `develop` → Railway build lại → `apps/backend/docker-entrypoint.sh` chạy `prisma migrate deploy` rồi mới khởi động app. **Đừng báo với người dùng là họ phải chạy `migrate deploy` tay** — chỉ cần khi migration lỗi làm container crash-loop; cách chạy tay ở [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) cạm bẫy #15.

**Đợt store console + redesign UI (PR #20–#35) đã merge vào `develop`:**

- Sync engine đủ vòng. Chi tiết ở [.claude/rules/tech-defaults.md](.claude/rules/tech-defaults.md) mục _Sync engine_.
- Quán có console riêng ở `/store`; `/dashboard` dành cho ORG_ADMIN; `/player/[storeId]?kiosk=1` là màn chiếu TV.
- UI dựng lại quanh sidebar thư viện, card playlist, bảng track và thanh phát cố định dùng chung.

**PR #39 — thanh nhạc hiện trên console quán + dashboard:** `ORG_ADMIN` bấm phát thì cả `/store` lẫn `/dashboard` đều hiện thanh nhạc đang chạy (đúng bài, đúng giây, tự cập nhật). `useSync` đẩy nhạc vào `PlayerProvider` thay vì tự lái thẻ audio; broadcast WS kèm `track: WsTrackMeta`; thêm `GET /sync/stores/:id/now-playing` để hydrate khi mở trang sau lúc admin đã phát.

Nợ đã biết: chưa có bảng `Artist`; track upload trước đợt này còn `durationMs = 0` nên không auto-next; timer auto-next chỉ đúng khi backend chạy 1 instance; `SchedulerService.matchesCron` vẫn bỏ qua ngày/tháng/thứ.

**PR #48–#51 (QC quản lý người dùng + cải tiến UI/UX dashboard) đã merge vào `develop`:**

- `/dashboard/users` thêm nút "Sửa" (trước đó **hoàn toàn chưa tồn tại**, không phải bug ẩn theo `storeId` như báo cáo QC ban đầu) và "Vô hiệu hoá tài khoản" — dialog bắt gõ đúng **tên quán** để xác nhận, fallback gõ **tên người dùng** nếu `STORE_ADMIN` chưa gán quán. Cả 2 hành động bị khoá trên hàng của chính admin đang đăng nhập (tránh tự khoá mình).
- `User.isActive` (mặc định `true`) được `AuthService` check ở cả 3 điểm: `login`, `refreshTokens`, và `validateJwtPayload` (chạy mỗi request có JWT) — access token còn hạn của tài khoản vừa bị vô hiệu hoá cũng bị từ chối ngay, không cần token blocklist. Chi tiết ở [.claude/rules/tech-defaults.md](.claude/rules/tech-defaults.md) mục _Auth — vô hiệu hoá tài khoản_.
- Sidebar `dashboard`/`store` full-height + có mobile drawer (trước đó cuộn mất theo trang, tràn ngang trên mobile). **Cách pin sidebar đã đổi ở PR #66** — xem mục dưới. Modal dùng chung qua `components/ui/Dialog.tsx` (enter/exit animation 180ms) thay vì mỗi nơi tự viết overlay riêng — chi tiết ở [.claude/rules/design.md](.claude/rules/design.md).
- `apps/web/src/lib/api-client.ts` tự đăng xuất (xoá token + redirect `/login`) khi nhận `401` ngoài `/auth/login` — tài khoản bị vô hiệu hoá giữa phiên không còn thấy lỗi rải rác trên UI mà được đưa thẳng về màn login.

**PR #53–#54 (QC luồng phát nhạc + bỏ tầng SyncGroup) đã merge vào `develop`:**

- **#53 — fix bug quán bấm phát trong trang playlist không ra tiếng.** `useSync` từng được mount bên trong `StoreHome` nên socket chỉ sống ở đúng `/store`; rời sang `/store/playlists/[id]` là cleanup `socket.disconnect()` chạy, browser rời room `store:<id>`, `POST .../play` vẫn 201 nhưng `store-now-playing` không còn ai nhận. Socket giờ nằm ở layout qua `components/sync/StoreSyncProvider.tsx`. **Bài học: socket sync phải mount ở layout, không phải ở page.**
- **#54 — bỏ hẳn `SyncGroup`, quán là đơn vị phát.** Nhóm sync trùng chức năng với quán nên bị xoá khỏi cả DB lẫn UI, kéo theo `StoreOverride` và toàn bộ khái niệm override / rejoin / `returnToGroupOnFinish`. `PlaylistSchedule` chuyển từ `syncGroupId` sang `storeId`.
  - `/dashboard/stores/[id]` (mới) là chỗ **duy nhất** phát nhạc ra loa quán: đang phát gì, tạm dừng/bài sau/dừng hẳn, danh sách playlist để phát, số màn hình đang kết nối.
  - `/dashboard/playlists` giờ chỉ **nghe thử tại chỗ** — ai bấm người đó nghe, không broadcast. Console quán `/store/**` vẫn phát thật cho quán của chính họ.
  - **Auto-next chuyển sang server** (`setTimeout` theo `durationMs`, keyed theo storeId). Trước đây client bắt `ended` rồi gọi `/next`: quán mở hai màn hình thì mỗi màn bắn một lệnh làm nhạc nhảy cóc, không màn nào mở thì nhạc đứng im.
  - Chi tiết ở [.claude/rules/tech-defaults.md](.claude/rules/tech-defaults.md) mục _Sync engine_.

**PR #56–#62 (nâng cấp trải nghiệm phát nhạc theo tham chiếu Spotify) đã merge vào `develop`:**

Xuất phát từ 4 điểm thiếu khi đối chiếu với Spotify: thanh phát nghèo nút, trang quán không xem được từng bài, app giật khi đang phát, motion rời rạc.

- **#57 — nguyên nhân "lag" không phải thiếu animation.** `PlayerProvider` bắn `setPositionMs` mỗi `timeupdate` nên **mọi** consumer của `usePlayer()` re-render vài lần/giây, kể cả bảng track dài chỉ cần biết bài nào đang phát. Vị trí phát tách sang `usePlayerPosition()` (`useSyncExternalStore` + vòng lặp rAF **tiết lưu 250ms** — ghi mỗi khung hình sẽ khiến `PlayerBar` và màn kiosk render 60 lần/giây, tệ hơn cả trước khi sửa). **Đừng đưa `positionMs` trở lại context `usePlayer()`.**
- **#58 — repeat / shuffle / bài trước làm ở server**, cùng chỗ với timer auto-next; làm ở client thì quán mở hai màn hình mỗi màn một trạng thái. Thêm `order`/`repeat`/`shuffle` vào `StorePlaybackState`, endpoint `/previous` + `PATCH /playback-mode`, event WS `store-mode-changed`, và cột `PlaylistTrack.addedAt`.
- **#59 — `TrackTable` + `TrackRow` dùng chung** (`components/track/`). Trước đó `PlaylistDetail` và `TrackLibrary` có hai bảng copy-paste gần giống hệt; #61 cần cái thứ ba nên tách trước. Có `extraColumns` để trang mới chèn cột riêng — **đừng dựng bảng track thứ tư**.
- **#60 — thanh phát đủ nút**: `CoverArt` + marquee, shuffle/prev/play/next/repeat, nút loa bấm để tắt tiếng, overlay "Đang phát" toàn màn hình (`NowPlayingOverlay.tsx`, đồng bộ qua `fullscreenchange` chứ không chỉ state React).
- **#61 — trang quán chọn được từng bài.** `/store` và `/dashboard/stores/[id]` hiện danh sách bài của playlist đang phát, bấm bài nào phát bài đó. `StoresSyncBridge` nâng thành external store lộ `useStoresSync(storeId)` để bỏ độ trễ 10 giây của poll (poll vẫn giữ làm phao).
- **#56 + #62 — motion.** Token `--duration-*`/`--ease-*` + class `.animate-slide-up`/`.animate-stagger-item`/`.skeleton`/`.press` trong `globals.css`; bỏ sạch `transition-all`; stagger giới hạn 8 item đầu. Khối `prefers-reduced-motion` phải ép **cả delay** về 0 — chỉ tắt duration thì item stagger index lớn kẹt ở `opacity: 0` suốt thời gian delay và **nội dung biến mất** với người bật giảm chuyển động.

Nợ đã biết (không đổi): chưa có bảng `Artist` nên không có cột Album / card nghệ sĩ; timer auto-next chỉ đúng khi backend chạy 1 instance; `SchedulerService.matchesCron` vẫn bỏ qua ngày/tháng/thứ. **Track `durationMs = 0` giờ có triệu chứng rõ hơn**: server không hẹn được giờ chuyển bài nên quán kẹt trạng thái "đang phát" vô hạn, và bộ đếm vị trí trên UI ngoại suy không giới hạn (quan sát thấy 331:32 cho một bài dài 25:52). Cần backfill `durationMs` cho track cũ hoặc chặn ngay lúc upload.

**PR #64–#66 (QC vòng phát nhạc + layout) đã merge vào `develop`:**

- **#64 — một tab chỉ nghe MỘT quán.** QC báo "store admin đổi bài thì cả chuỗi đổi theo". Backend vốn đã scope đúng theo room `store:<id>`; lỗi ở web: `StoresSyncBridge` fetch `GET /stores` rồi mở **một socket cho mọi quán**, tất cả đổ vào **một** thẻ `<audio>` không lọc `storeId` nên quán nào bắn event cũng cướp được nó — và nút "Bài kế tiếp" bắn vào `usePlayer().storeId` = quán vừa bắn event gần nhất, nên org admin đang xem quán A **đổi bài thật của quán C**. Giờ bridge chỉ mở socket cho quán mà URL đang mở (`focusedStoreIdFrom`), `useSync` bỏ qua payload của quán khác, và lệnh dừng đi qua `pauseStore(storeId)`/`stopStore(storeId)` (tự no-op nếu audio đang phát nhạc quán khác). Phụ: mỗi tab dashboard từng cộng +1 "màn hình đang kết nối" cho **mọi** quán — con số giờ đúng.
- **#65 — bấm next ở bài cuối không còn đá người dùng ra khỏi playlist.** `nextStore` từng gọi `stopStore()` ở cuối hàng chờ (xoá state Redis + `store-stopped`) nên thanh phát biến mất và mất luôn ngữ cảnh playlist. Giờ là no-op trả `{ finished: true, playback }`; `repeat: 'ALL'` thì quay về bài đầu. `advance()` (auto-next theo timer) **vẫn** dừng hẳn khi hết hàng chờ — ở đó bài cuối đã phát xong thật. UI bỏ nút hẳn ở hai đầu hàng chờ (`TransportControls` + `StoreDetail`, `StoreDetail` được thêm nút "Bài trước").
- **#66 — sidebar đứng yên, mobile dùng được.** Shell là `h-[100dvh] overflow-hidden`, sidebar `overflow-hidden`, **chỉ `<main>` cuộn**; trong sidebar chỉ khối thư viện playlist cuộn (bắt buộc `min-h-0`, thiếu nó thì `overflow` vô hiệu). Thêm **thang z-index** trong `globals.css` — thanh phát (50) từng đè lên drawer nav (40) nên mở menu trên mobile là không bấm được nút Đăng xuất. Thanh phát mobile thu về **mini-player một hàng** cao `--player-bar-h` (64px / 88px từ `md`), ẩn seek/âm lượng/shuffle/repeat dưới `md`. Chi tiết ở [.claude/rules/design.md](.claude/rules/design.md).

**Bài học chung của đợt này:** ba trong bốn lỗi QC là **lỗi phạm vi/lớp, không phải lỗi logic** — một thẻ audio dùng chung mà nhiều nguồn ghi vào, một lệnh không mang `storeId`, một z-index chọn tuỳ file. Khi thêm nguồn sự kiện hay lớp nổi mới, hỏi trước: _ai sở hữu tài nguyên này, và ai được phép ghi vào nó?_

## MCP Servers

Khai báo ở [.mcp.json](.mcp.json), mỗi người tự bật trong `.claude/settings.local.json` (`enabledMcpjsonServers`). Chi tiết setup: [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

| Server            | Dùng để                                                                      | Cần gì trên máy                       |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| `github`          | Thao tác issue / PR / code search trực tiếp                                  | Biến môi trường `GITHUB_PAT`          |
| `chrome-devtools` | Mở app thật trong Chrome để xem UI, đọc console/network, đo performance/a11y | Google Chrome + Node (chạy qua `npx`) |

`chrome-devtools` chạy Chrome bằng **profile riêng** (`~/.cache/chrome-devtools-mcp/chrome-profile`), không đụng vào profile cá nhân đang đăng nhập. Chỉ nhóm tool đọc (screenshot, snapshot, console, network) được auto-allow; navigate / click / gõ phím / `evaluate_script` vẫn hỏi từng lần.
