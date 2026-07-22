# Cafe Music — Claude Code Project Instructions

Nền tảng phát nhạc đồng bộ cho chuỗi quán cafe. Monorepo TypeScript (pnpm + Turborepo): NestJS backend, Next.js web, shared packages. Chi tiết setup/local dev: [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

Các rule chi tiết dưới đây áp dụng luôn, không chỉ khi được hỏi:

@.claude/rules/tech-defaults.md
@.claude/rules/workflow.md
@.claude/rules/design.md

## Quy tắc bắt buộc (không được vi phạm)

- **Mọi thay đổi đi qua PR** — không commit thẳng vào `develop`/`main`. Tạo nhánh → commit → push → mở PR vào `develop`.
- **`main` do chủ repo quản lý** — Claude không merge, không push vào `main`.
- **Chỉ merge vào `develop` khi CI + test pass hết** — verify job `Lint + Unit Tests` xanh (`gh pr checks`) trước khi merge.
- **Cập nhật `CLAUDE.md` + `.claude/rules/*`** khi task làm thay đổi convention, tooling hay quy trình.

Chi tiết merge policy: [.claude/rules/workflow.md](.claude/rules/workflow.md).

## MCP Servers

Project dùng GitHub MCP server (khai báo ở [.mcp.json](.mcp.json)) để thao tác issue/PR/code search trực tiếp. Cần set biến môi trường `GITHUB_PAT` trên máy — xem [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) mục *GitHub MCP Server*.
