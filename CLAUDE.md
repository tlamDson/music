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

Chi tiết merge policy: [.claude/rules/workflow.md](.claude/rules/workflow.md).

## Trạng thái dự án

Đang chuẩn bị release production đầu tiên (`v0.1.0`). **Phase 0 (code readiness) đã xong** — xem [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) để biết đã làm gì, còn nợ gì và bước tiếp theo. Đọc file đó trước khi bắt tay vào việc liên quan deploy/staging/release.

**Đợt store console + redesign UI (PR #20–#35) đã merge vào `develop`:**

- Sync engine đủ vòng: nhóm tự chuyển bài → quán tách ra phát playlist riêng → hết hàng chờ tự quay lại đúng bài, đúng giây. Chi tiết ở [.claude/rules/tech-defaults.md](.claude/rules/tech-defaults.md) mục _Sync engine_.
- Quán có console riêng ở `/store` (không có Sync Control); `/dashboard` dành cho ORG_ADMIN; `/player/[storeId]?kiosk=1` là màn chiếu TV.
- UI dựng lại quanh sidebar thư viện, card playlist, bảng track và thanh phát cố định dùng chung.

Nợ đã biết: chưa có bảng `Artist`; track upload trước đợt này còn `durationMs = 0` nên không auto-next; timer auto-next chỉ đúng khi backend chạy 1 instance; `SchedulerService.matchesCron` vẫn bỏ qua ngày/tháng/thứ.

**PR #42 (fix 3 bug QC luồng sync playback) đã merge vào `develop`:**

- Play nhóm giờ báo đúng lỗi thật (không đoán bừa "playlist có track chưa"); dashboard admin nghe được mọi sync group thay vì chỉ nhóm đầu tiên.
- Bấm Play/Skip cho nhóm tự kéo mọi quán trong nhóm về "in sync" (xoá override cũ) — quán từng tách ra không còn mãi hiện "Overriding".
- Quán dừng cục bộ rồi phát lại (hoặc rejoin) tự bắt kịp đúng giây của nhóm nhờ "neo đồng bộ" + tự chỉnh trôi ở `PlayerProvider`, thay vì tiếp tục từ chỗ đã dừng. Chi tiết ở [.claude/rules/tech-defaults.md](.claude/rules/tech-defaults.md) mục _Sync engine_.

## MCP Servers

Khai báo ở [.mcp.json](.mcp.json), mỗi người tự bật trong `.claude/settings.local.json` (`enabledMcpjsonServers`). Chi tiết setup: [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

| Server            | Dùng để                                                                      | Cần gì trên máy                       |
| ----------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| `github`          | Thao tác issue / PR / code search trực tiếp                                  | Biến môi trường `GITHUB_PAT`          |
| `chrome-devtools` | Mở app thật trong Chrome để xem UI, đọc console/network, đo performance/a11y | Google Chrome + Node (chạy qua `npx`) |

`chrome-devtools` chạy Chrome bằng **profile riêng** (`~/.cache/chrome-devtools-mcp/chrome-profile`), không đụng vào profile cá nhân đang đăng nhập. Chỉ nhóm tool đọc (screenshot, snapshot, console, network) được auto-allow; navigate / click / gõ phím / `evaluate_script` vẫn hỏi từng lần.
