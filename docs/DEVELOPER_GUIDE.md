# Developer Guide — Cafe Music

Nền tảng phát nhạc đồng bộ cho chuỗi quán cafe. Monorepo TypeScript: NestJS backend, Next.js web, shared packages.

---

## 1. Setup Environment

### Prerequisites

| Tool           | Version   | Dùng cho                            |
| -------------- | --------- | ----------------------------------- |
| Node.js        | >= 20 LTS | Backend, web, build                 |
| pnpm           | >= 11     | Quản lý monorepo                    |
| Git            | latest    | Version control                     |
| Docker Desktop | latest    | Postgres, Redis, MinIO (dev)        |
| Python         | 3.x       | UI UX Pro Max design system scripts |

**Cài đặt nhanh (Windows):**

```powershell
node --version
pnpm --version
git --version
python --version
winget install Docker.DockerDesktop
```

### Clone Repository

```bash
git clone https://github.com/tlamDson/music.git
cd music
```

### Configure Git

```bash
git config user.name "Your Name"
git config user.email "your.email@example.com"
git config --list
```

> Dùng email bạn đăng ký GitHub. Không dùng email cá nhân khác với tài khoản GitHub nếu muốn commit được ghi nhận đúng.

### Install Dependencies

```bash
pnpm install
```

### Start Local Infrastructure

```bash
docker compose up -d
```

Services:

| Service           | URL / Port              | Mục đích              |
| ----------------- | ----------------------- | --------------------- |
| PostgreSQL        | `localhost:5432`        | Database chính        |
| PostgreSQL (test) | `localhost:5433`        | Integration tests     |
| Redis             | `localhost:6379`        | Sync state, pub/sub   |
| MinIO             | `http://localhost:9000` | S3-compatible storage |
| MinIO Console     | `http://localhost:9001` | Quản lý bucket        |

### Database Schema

Schema được quản lý bằng **Prisma migrations** (đã baseline ở `prisma/migrations/20260722000000_init`). Không dùng `prisma db push` nữa.

**Setup database mới:**

```bash
pnpm --filter @cafe-music/backend exec prisma migrate deploy
pnpm --filter @cafe-music/backend prisma:seed
```

**Đổi schema:** sửa `schema.prisma` rồi tạo migration mới — không sửa tay file migration đã commit:

```bash
pnpm --filter @cafe-music/backend exec prisma migrate dev --name <mo-ta-ngan>
```

> **Database dev tạo trước khi có baseline** (đã từng chạy `db push`) sẽ báo lỗi vì bảng đã tồn tại. Đánh dấu baseline là đã áp dụng, chạy đúng một lần:
>
> ```bash
> pnpm --filter @cafe-music/backend exec prisma migrate resolve --applied 20260722000000_init
> ```
>
> Cách khác cho DB dev bỏ đi được: drop database rồi `migrate deploy` lại từ đầu.

Production (Railway) chạy `prisma migrate deploy` tự động lúc khởi động container — xem phần deploy.

### Environment Files

Copy và điền giá trị local:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local
```

Xem chi tiết từng biến trong [`apps/backend/.env.example`](../apps/backend/.env.example) và [`apps/web/.env.example`](../apps/web/.env.example).

### GitHub MCP Server (cho Claude Code)

Repo khai báo sẵn GitHub MCP server ở [`.mcp.json`](../.mcp.json), cho phép Claude Code thao tác issue / PR / code search trực tiếp. File chỉ chứa **tên biến môi trường**, không chứa token — mỗi người tự tạo token của mình.

**1. Tạo Personal Access Token**

Vào https://github.com/settings/tokens → **Generate new token**:

| Loại token   | Quyền cần cấp                                                         |
| ------------ | --------------------------------------------------------------------- |
| Fine-grained | Repo `tlamDson/music` → Contents, Issues, Pull requests, Actions (RW) |
| Classic      | Scope `repo`, `read:org`, `workflow`                                  |

**2. Set biến môi trường `GITHUB_PAT`**

```powershell
# Windows (PowerShell)
setx GITHUB_PAT "github_pat_xxxxxxxx"
```

```bash
# macOS / Linux — thêm vào ~/.zshrc hoặc ~/.bashrc
export GITHUB_PAT="github_pat_xxxxxxxx"
```

> `setx` không áp dụng cho cửa sổ đang mở — phải **đóng hẳn VSCode rồi mở lại** thì Claude Code mới đọc được biến mới.

**3. Kiểm tra**

```bash
claude mcp list
# → github: https://api.githubcopilot.com/mcp/ (HTTP) - ✔ Connected
```

> **Lưu ý:** server này xác thực bằng PAT chứ không phải OAuth — remote server của GitHub không hỗ trợ dynamic client registration nên flow OAuth tự động sẽ báo lỗi `Incompatible auth server`.
>
> **Không** dán token trực tiếp vào `.mcp.json`. Giữ nguyên dạng `${GITHUB_PAT}`.

### Claude Code Settings — shared vs local

| File                          | Track trong git? | Đặt gì vào đây                                                            |
| ----------------------------- | ---------------- | ------------------------------------------------------------------------- |
| `.claude/settings.json`       | Có               | Cấu hình dùng chung cả team, phải chạy được trên Windows/macOS/Linux      |
| `.claude/settings.local.json` | Không (ignored)  | Cấu hình riêng máy bạn: hook phụ thuộc OS, permission cá nhân, MCP toggle |

> Hook chỉ chạy trên một OS (ví dụ phát âm thanh bằng PowerShell) phải để trong `settings.local.json` — nếu đặt ở `settings.json` thì đồng đội dùng OS khác sẽ lỗi hook mỗi lần Claude chạy xong.

### Run Development Servers

```bash
# Tất cả apps (turbo)
pnpm dev

# Hoặc từng app
pnpm --filter @cafe-music/backend dev   # http://localhost:4000/api/v1
pnpm --filter @cafe-music/web dev       # http://localhost:3000
```

### Health Check

```bash
curl http://localhost:4000/api/v1/health
# → { "status": "ok" }
```

---

## 2. Git Flow

### Overview

Mọi thay đổi code phải qua **Pull Request** — không commit hay push trực tiếp lên `develop` và `main`.

```
develop  ←  feature/*  (PR + CI pass)
main     ←  develop    (PR + CI pass, production-ready — chỉ chủ repo merge)
```

| Nhánh       | Mục đích                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `main`      | Production-ready. Chỉ merge từ `develop`. Có branch protection. **Chủ repo quản lý — không ai khác merge.** |
| `develop`   | Integration branch. Mọi feature PR merge vào đây.                                                           |
| `feature/*` | Làm việc hàng ngày. Tạo từ `develop`.                                                                       |
| `fix/*`     | Bug fix. Tạo từ `develop` (hoặc `main` nếu hotfix production).                                              |
| `test/*`    | Thêm/sửa tests.                                                                                             |
| `chore/*`   | CI, tooling, config.                                                                                        |
| `docs/*`    | Tài liệu.                                                                                                   |

### Step by Step

```bash
# 1. Luôn bắt đầu từ develop mới nhất
git checkout develop
git pull origin develop

# 2. Tạo nhánh mới
git checkout -b feature/auth-module

# 3. Làm việc theo TDD (xem Section 3)
# RED → GREEN → REFACTOR

# 4. Stage và commit
git add <files>
git commit -m "add auth login endpoint with JWT validation"

# 5. Push lên GitHub
git push -u origin feature/auth-module

# 6. Mở PR trên GitHub → base: develop
```

### Branch Naming Convention

| Type           | Format                  | Example                      |
| -------------- | ----------------------- | ---------------------------- |
| New feature    | `feature/<description>` | `feature/sync-engine`        |
| Bug fix        | `fix/<description>`     | `fix/player-autoplay-unlock` |
| Add tests      | `test/<module>`         | `test/playlists-service`     |
| Docs           | `docs/<name>`           | `docs/developer-guide`       |
| CI/CD, tooling | `chore/<description>`   | `chore/ci-github-actions`    |

**Quy tắc:**

- Chữ thường, dùng dấu `-` phân tách từ
- Ngắn gọn, mô tả đúng phạm vi task
- Không dùng tên chung chung: `feature/update`, `fix/bug`

### Writing Good Commit Messages

Viết ở **imperative mood** — hoàn thành câu: _"If applied, this commit will… **[your message]**"_

**Good**

```bash
add unit test for playlist RBAC store admin scope
fix websocket clock-sync offset calculation
update developer guide with local setup steps
```

**Bad**

```bash
fix bug
update code
WIP
added stuff
```

**Scope gợi ý theo app:**

| Prefix ngầm    | Ví dụ                                               |
| -------------- | --------------------------------------------------- |
| Backend module | `add sync override endpoint for store admin`        |
| Frontend UI    | `add player bar component with override button`     |
| Shared types   | `add PlayGroupDto schema to shared package`         |
| CI/docs        | `chore: simplify ci-pr workflow to unit tests only` |

---

## 3. TDD & Running Tests

### Workflow bắt buộc

Mọi feature mới tuân thủ **Red → Green → Refactor**:

1. **RED** — Viết test fail trước, không viết implementation
2. **GREEN** — Code tối thiểu để pass
3. **REFACTOR** — Cải thiện code, test vẫn pass

Chi tiết: [`.cursor/rules/tdd-workflow.mdc`](../.cursor/rules/tdd-workflow.mdc)

### Test Locations

| Layer       | Backend                                           | Frontend                                       |
| ----------- | ------------------------------------------------- | ---------------------------------------------- |
| Unit        | `apps/backend/test/unit/<module>.service.spec.ts` | `apps/web/__tests__/unit/<Component>.test.tsx` |
| Integration | `apps/backend/test/integration/`                  | `apps/web/__tests__/integration/`              |
| E2E         | `apps/backend/test/e2e/`                          | `apps/web/__tests__/e2e/` (Playwright)         |

### Run Tests Locally

```bash
# Unit tests (nhanh — chạy thường xuyên khi code)
pnpm turbo test:unit

# Backend only
pnpm --filter @cafe-music/backend test:unit
pnpm --filter @cafe-music/backend test:unit --watch

# Frontend only
pnpm --filter @cafe-music/web test:unit

# Integration (cần Docker: postgres_test + redis)
pnpm turbo test:integration

# E2E (Playwright — cần app chạy)
pnpm --filter @cafe-music/web test:e2e
```

### When Does CI Run?

| Event               | Workflow           | Job name               | Chạy? |
| ------------------- | ------------------ | ---------------------- | ----- |
| Push to `feature/*` | —                  | —                      | No    |
| Open PR → `develop` | `CI - PR Check`    | `Lint + Unit Tests`    | Yes   |
| Open PR → `main`    | `CI - PR Check`    | `Lint + Unit Tests`    | Yes   |
| Push to `main`      | `CI - Main (Full)` | `Full CI + Unit Tests` | Yes   |

### Viewing Test Results

1. Vào https://github.com/tlamDson/music
2. Tab **Actions**
3. Chọn workflow run mới nhất → click job **Lint + Unit Tests**

**Passed** — PR sẵn sàng review/merge.

**Failed** — Đọc log → fix → push commit mới lên cùng nhánh → CI tự chạy lại.

### Branch Protection (main)

Khi setup branch protection cho `main`, chọn status check:

```
Lint + Unit Tests
```

---

## 4. Creating a Pull Request

### Step by Step

1. Push nhánh lên GitHub
2. Vào https://github.com/tlamDson/music/compare/develop...your-branch
3. **base:** `develop` | **compare:** nhánh của bạn
4. Điền title và description (xem template bên dưới)
5. Đợi CI **Lint + Unit Tests** pass
6. Request review → merge

### Merge Policy

| Target    | Ai được merge      | Điều kiện                                                                      |
| --------- | ------------------ | ------------------------------------------------------------------------------ |
| `develop` | Dev / AI assistant | CI `Lint + Unit Tests` **pass** + test local pass. CI đỏ hoặc đang chạy → đợi. |
| `main`    | **Chỉ chủ repo**   | Release thủ công từ `develop`. Không ai khác merge hay push vào `main`.        |

Verify CI trước khi merge:

```bash
gh pr checks <PR-number>          # tất cả check phải xanh
gh pr merge <PR-number> --squash  # chỉ chạy sau khi xác nhận pass
```

> PR vào `main` chỉ dùng khi release (merge `develop` → `main`), không dùng cho feature hàng ngày — và do chủ repo tự thực hiện.

### PR Title Convention

| Type    | Format                 | Example                                        |
| ------- | ---------------------- | ---------------------------------------------- |
| Feature | `feat: <mô tả ngắn>`   | `feat: add store admin playlist override`      |
| Fix     | `fix: <mô tả ngắn>`    | `fix: player seek position on tight sync mode` |
| Test    | `test: <module/scope>` | `test: auth service login validation`          |
| Docs    | `docs: <mô tả>`        | `docs: add developer guide`                    |
| Chore   | `chore: <mô tả>`       | `chore: update ci-pr workflow`                 |

### PR Description Template

```markdown
## Summary

- <1-3 bullet points: thay đổi gì và tại sao>

## Test plan

- [ ] Unit tests added/updated (RED → GREEN)
- [ ] `pnpm turbo test:unit` pass locally
- [ ] No secrets or .env files committed
- [ ] UI changes follow design-system/cafe-music/MASTER.md (if applicable)

## Screenshots (if UI)

<!-- attach screenshots -->
```

### Pre-submit Checklist

- [ ] Nhánh checkout từ `develop` mới nhất
- [ ] Không commit credentials (`.env`, tokens, keys)
- [ ] Commit messages rõ ràng (Section 2)
- [ ] Có test cho logic mới (TDD)
- [ ] PR target `develop`, không phải `main`
- [ ] CI job **Lint + Unit Tests** pass

---

## 5. Repository Structure

```
cafe-music/
├── apps/
│   ├── backend/                  NestJS API + WebSocket sync
│   │   ├── src/
│   │   │   ├── modules/          auth, organizations, stores, playlists, tracks, sync
│   │   │   ├── common/           guards, decorators, pipes
│   │   │   └── prisma/           PrismaService
│   │   ├── prisma/
│   │   │   └── schema.prisma     Database schema
│   │   └── test/
│   │       ├── unit/             Mock-based, fast
│   │       ├── integration/      Real DB (test container)
│   │       └── e2e/              Full HTTP (supertest)
│   │
│   └── web/                      Next.js (App Router)
│       ├── src/app/
│       │   ├── (auth)/           Login
│       │   ├── dashboard/        Admin dashboard
│       │   └── player/           Player tại quầy cafe
│       ├── src/components/
│       │   ├── ui/               Base components
│       │   └── features/         Domain components
│       └── __tests__/
│           ├── unit/             Component tests (RTL)
│           ├── integration/      MSW mock API
│           └── e2e/              Playwright
│
├── packages/
│   └── shared/                   Types, Zod schemas, constants (BE + FE)
│
├── design-system/
│   └── cafe-music/
│       ├── MASTER.md             Global UI tokens (colors, fonts, spacing)
│       └── pages/                Page-specific overrides (nếu có)
│
├── .cursor/
│   ├── rules/                    Cursor AI rules (TDD, UI, git conventions)
│   └── skills/                   AI skills (ui-ux-pro-max, ...)
│
├── .github/workflows/            CI/CD (ci-pr.yml, ci-main.yml)
├── docker-compose.yml            Postgres, Redis, MinIO
├── turbo.json                    Turborepo task config
└── pnpm-workspace.yaml           Monorepo workspace + allowBuilds
```

### Key Directories Explained

| Path                                 | Mô tả                                                                 |
| ------------------------------------ | --------------------------------------------------------------------- |
| `apps/backend/src/modules/`          | Mỗi domain một module NestJS (service, controller, test riêng)        |
| `apps/backend/prisma/schema.prisma`  | Schema DB: org, store, playlist, track, sync group                    |
| `apps/web/src/app/player/`           | Trang phát nhạc tại quầy — kết nối WebSocket                          |
| `apps/web/src/app/dashboard/`        | Admin điều khiển playlist, sync group                                 |
| `packages/shared/`                   | DTO Zod + TypeScript types dùng chung — đổi ở đây, BE và FE cùng sync |
| `design-system/cafe-music/MASTER.md` | Nguồn sự thật UI — đọc trước khi code frontend                        |
| `.cursor/rules/`                     | Quy tắc bắt buộc cho AI assistant trong Cursor                        |
| `.github/workflows/`                 | CI tự chạy khi PR/push                                                |

---

## 6. Frontend & Design System

Trước khi sửa UI ở `apps/web`:

1. Đọc [`design-system/cafe-music/MASTER.md`](../design-system/cafe-music/MASTER.md)
2. Kiểm tra `design-system/cafe-music/pages/<page>.md` nếu có
3. Sinh/cập nhật design system khi cần:

```bash
python .cursor/skills/ui-ux-pro-max/scripts/search.py "music dashboard player" --design-system --persist -p "Cafe Music"
```

Chi tiết: [`.cursor/rules/frontend-ui-ux-pro-max.mdc`](../.cursor/rules/frontend-ui-ux-pro-max.mdc)

---

## 7. API Overview (Staging / Local)

| Environment | API Base                       | Web                     |
| ----------- | ------------------------------ | ----------------------- |
| Local       | `http://localhost:4000/api/v1` | `http://localhost:3000` |
| Production  | TBD                            | TBD                     |

**Ví dụ local:**

```bash
# Health check
curl http://localhost:4000/api/v1/health

# Login (khi auth module sẵn sàng)
curl -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}'
```

> Không hardcode token hay password vào code hay commit. Dùng `.env` local.

---

## 8. Quick Reference

```bash
# Setup lần đầu
git clone https://github.com/tlamDson/music.git && cd music
pnpm install && docker compose up -d
cp apps/backend/.env.example apps/backend/.env
cp apps/web/.env.example apps/web/.env.local

# Làm feature mới
git checkout develop && git pull
git checkout -b feature/my-feature
pnpm turbo test:unit --watch   # TDD
git push -u origin feature/my-feature
# → Mở PR vào develop trên GitHub
```
