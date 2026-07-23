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

## MCP Servers

Project dùng GitHub MCP server (khai báo ở [.mcp.json](.mcp.json)) để thao tác issue/PR/code search trực tiếp. Cần set biến môi trường `GITHUB_PAT` trên máy — xem [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) mục _GitHub MCP Server_.
