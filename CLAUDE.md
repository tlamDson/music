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

**Đợt store console + redesign UI (PR #20–#35) đã merge vào `develop`:**

- Sync engine đủ vòng: nhóm tự chuyển bài → quán tách ra phát playlist riêng → hết hàng chờ tự quay lại đúng bài, đúng giây. Chi tiết ở [.claude/rules/tech-defaults.md](.claude/rules/tech-defaults.md) mục _Sync engine_.
- Quán có console riêng ở `/store` (không có Sync Control); `/dashboard` dành cho ORG_ADMIN; `/player/[storeId]?kiosk=1` là màn chiếu TV.
- UI dựng lại quanh sidebar thư viện, card playlist, bảng track và thanh phát cố định dùng chung.

**PR #39 — thanh nhạc hiện trên console quán + dashboard:** `ORG_ADMIN` bấm phát thì cả `/store` lẫn `/dashboard` đều hiện thanh nhạc đang chạy (đúng bài, đúng giây, tự cập nhật). `useSync` đẩy nhạc vào `PlayerProvider` thay vì tự lái thẻ audio; broadcast WS kèm `track: WsTrackMeta`; thêm `GET /sync/{stores|groups}/:id/now-playing` để hydrate khi mở trang sau lúc admin đã phát; dashboard mount `components/sync/DashboardSyncBridge.tsx`. Chi tiết mục Sync engine trong [.claude/rules/tech-defaults.md](.claude/rules/tech-defaults.md).

Nợ đã biết: chưa có bảng `Artist`; track upload trước đợt này còn `durationMs = 0` nên không auto-next (nhóm phát quá thời lượng thật → thanh phát của quán khớp trạng thái nhưng progress lệch); timer auto-next chỉ đúng khi backend chạy 1 instance; `SchedulerService.matchesCron` vẫn bỏ qua ngày/tháng/thứ.

**PR #42 (fix 3 bug QC luồng sync playback) đã merge vào `develop`:**

- Play nhóm giờ báo đúng lỗi thật (không đoán bừa "playlist có track chưa"); dashboard admin nghe được mọi sync group thay vì chỉ nhóm đầu tiên.
- Bấm Play/Skip cho nhóm tự kéo mọi quán trong nhóm về "in sync" (xoá override cũ) — quán từng tách ra không còn mãi hiện "Overriding".
- Quán dừng cục bộ rồi phát lại (hoặc rejoin) tự bắt kịp đúng giây của nhóm nhờ "neo đồng bộ" + tự chỉnh trôi ở `PlayerProvider`, thay vì tiếp tục từ chỗ đã dừng. Chi tiết ở [.claude/rules/tech-defaults.md](.claude/rules/tech-defaults.md) mục _Sync engine_.

**PR #48–#51 (QC quản lý người dùng + cải tiến UI/UX dashboard) đã merge vào `develop`:**

- `/dashboard/users` thêm nút "Sửa" (trước đó **hoàn toàn chưa tồn tại**, không phải bug ẩn theo `storeId` như báo cáo QC ban đầu) và "Vô hiệu hoá tài khoản" — dialog bắt gõ đúng **tên quán** để xác nhận, fallback gõ **tên người dùng** nếu `STORE_ADMIN` chưa gán quán. Cả 2 hành động bị khoá trên hàng của chính admin đang đăng nhập (tránh tự khoá mình).
- `User.isActive` (mặc định `true`) được `AuthService` check ở cả 3 điểm: `login`, `refreshTokens`, và `validateJwtPayload` (chạy mỗi request có JWT) — access token còn hạn của tài khoản vừa bị vô hiệu hoá cũng bị từ chối ngay, không cần token blocklist. Chi tiết ở [.claude/rules/tech-defaults.md](.claude/rules/tech-defaults.md) mục _Auth — vô hiệu hoá tài khoản_.
- Sidebar `dashboard`/`store` giờ `sticky` full-height + có mobile drawer (trước đó cuộn mất theo trang, tràn ngang trên mobile). Modal dùng chung qua `components/ui/Dialog.tsx` (enter/exit animation 180ms) thay vì mỗi nơi tự viết overlay riêng — chi tiết ở [.claude/rules/design.md](.claude/rules/design.md).
- `apps/web/src/lib/api-client.ts` tự đăng xuất (xoá token + redirect `/login`) khi nhận `401` ngoài `/auth/login` — tài khoản bị vô hiệu hoá giữa phiên không còn thấy lỗi rải rác trên UI mà được đưa thẳng về màn login.

## MCP Servers

Khai báo ở [.mcp.json](.mcp.json), mỗi người tự bật trong `.claude/settings.local.json` (`enabledMcpjsonServers`). Chi tiết setup: [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

| Server            | Dùng để                                                                      | Cần gì trên máy                       |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| `github`          | Thao tác issue / PR / code search trực tiếp                                  | Biến môi trường `GITHUB_PAT`          |
| `chrome-devtools` | Mở app thật trong Chrome để xem UI, đọc console/network, đo performance/a11y | Google Chrome + Node (chạy qua `npx`) |

`chrome-devtools` chạy Chrome bằng **profile riêng** (`~/.cache/chrome-devtools-mcp/chrome-profile`), không đụng vào profile cá nhân đang đăng nhập. Chỉ nhóm tool đọc (screenshot, snapshot, console, network) được auto-allow; navigate / click / gõ phím / `evaluate_script` vẫn hỏi từng lần.
