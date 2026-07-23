# Workflow — Git Flow, Commit, PR, TDD

## Quy tắc bất di bất dịch

1. **Mọi thay đổi đều phải qua PR.** Không bao giờ commit thẳng vào `develop` hay `main`. Có gì cần commit → tạo nhánh mới → commit → push → mở PR vào `develop`.
2. **`main` do chủ repo quản lý.** Claude/dev **không được** merge vào `main` dưới bất kỳ hình thức nào (kể cả khi CI xanh). PR `develop → main` chỉ chủ repo tự thực hiện khi release.
3. **Chỉ merge PR vào `develop` khi CI + toàn bộ test pass.** Bắt buộc xác nhận **cả 3 job** đã xanh: `Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build`. CI đỏ hoặc đang chạy → không merge, đợi hoặc fix.
4. **Cập nhật `CLAUDE.md` và `.claude/rules/*` khi task làm thay đổi convention/tooling**, để lần sau còn áp dụng đúng.

## Git Flow

`develop ← feature/* (PR + CI pass)`, `main ← develop (PR + CI pass, production-ready — chỉ chủ repo merge)`. Không bao giờ push thẳng lên `main`. Luôn tạo nhánh mới từ `develop` mới nhất:

```bash
git checkout develop
git pull origin develop
git checkout -b <type>/<short-kebab-case-description>
```

**Branch types:** `feature/`, `fix/`, `test/`, `docs/`, `chore/`. Chữ thường, phân tách bằng `-`, mô tả cụ thể phạm vi (không dùng `feature/update`, `fix/bug`, `feature/wip`). Ghi rõ module/trang liên quan khi có thể: `feature/sync-override`, `feature/player-bar`.

## Commit Messages

Imperative mood, hoàn thành câu _"If applied, this commit will… [message]"_. Một dòng, không dùng prefix `feat:`/`fix:` (prefix đó chỉ dành cho PR title).

Verb chuẩn: `add`, `fix`, `update`, `remove`, `refactor`, `test`, `docs`, `chore`.

```
add unit test for playlist store admin RBAC scope
fix websocket clock-sync offset on reconnect
update player bar to show override state from sync group
```

Không dùng: `fix bug`, `update code`, `WIP`, `added stuff`, past tense (`Fixed login`), hay prefix `feat:` trong commit.

Không commit: `.env`/credentials/tokens, `node_modules/`, `dist/`, `.next/`, coverage reports, file không liên quan task.

## Pull Requests

Target mặc định là `develop` (chỉ target `main` khi release, từ `develop`). Title format `<type>: <short description>` (< 72 ký tự): `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.

PR description dùng template:

```markdown
## Summary

- <thay đổi chính>
- <lý do / impact>

## Test plan

- [ ] Unit tests added/updated (TDD: RED → GREEN)
- [ ] `pnpm turbo test:unit` pass locally
- [ ] No `.env` or secrets committed
- [ ] UI follows design-system/cafe-music/MASTER.md (if frontend)
```

Trước khi đề xuất merge, tự verify: nhánh tạo từ `develop` mới nhất, commit message đúng convention, có test cho logic mới, không hardcode secrets, PR target đúng branch. CI check bắt buộc: `Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build`.

### Merge policy

| Target    | Ai merge             | Điều kiện                                                                            |
| --------- | -------------------- | ------------------------------------------------------------------------------------ |
| `develop` | Claude/dev được phép | **Cả 3 CI job pass** + toàn bộ test local pass. CI đỏ/đang chạy → đợi, không merge.  |
| `main`    | **Chỉ chủ repo**     | Claude không merge, không push, không tự mở PR release trừ khi được yêu cầu rõ ràng. |

Kiểm tra CI trước khi merge:

```bash
gh pr checks <PR-number>          # xem trạng thái từng check
gh pr merge <PR-number> --squash  # chỉ chạy khi tất cả check xanh
```

> `gh` có thể chưa được auth trên máy. Khi đó dùng GitHub MCP server (`pull_request_read` với method `get_check_runs`) hoặc gọi thẳng REST API bằng `$GITHUB_PAT`.

## TDD (Red → Green → Refactor) — bắt buộc cho mọi feature/fix

1. **RED** — viết test fail trước, chưa viết implementation. Backend: `apps/backend/test/unit/<module>.service.spec.ts`. Frontend: `apps/web/__tests__/unit/<Component>.test.tsx`. Xác nhận thấy đỏ trước khi tiếp tục.
2. **GREEN** — code tối thiểu để pass, không thêm logic chưa có test bao phủ.
3. **REFACTOR** — cải thiện code, chạy lại toàn bộ test, không được break.

```bash
# Backend
pnpm --filter backend test:unit
pnpm --filter backend test:unit --watch
pnpm --filter backend test:integration
pnpm --filter backend test:e2e

# Frontend
pnpm --filter web test
pnpm --filter web test:e2e   # Playwright
```

Backend mock Prisma bằng `jest-mock-extended` (`mockDeep<PrismaClient>()`) — không dùng real DB trong unit test. Frontend mock API bằng MSW, không mock module trực tiếp nếu MSW đủ dùng.

Quy ước bổ sung rút ra khi làm store console:

- **Trang web nào có nút phát đều phải render trong `PlayerProvider`** — dùng helper `apps/web/__tests__/utils/renderWithPlayer.tsx` thay cho `render()`, đúng như layout gốc.
- **Lỗi routing của Nest không bắt được bằng unit test gọi thẳng method controller.** Dựng app thật + `supertest` trong `test/unit/` (xem `folders.controller.spec.ts`) — vẫn mock hết provider nên không cần DB.
- Spec dựng app Nest ngốn RAM: `apps/backend/jest.config.ts` đã set `maxWorkers: '50%'` + `workerIdleMemoryLimit` để worker không "ran out of memory" khi turbo chạy song song backend + web.
- Test timer (auto-next, hẹn giờ chuyển bài): `jest.useFakeTimers()` + `await jest.advanceTimersByTimeAsync(ms)`; nhớ `jest.useRealTimers()` trong `afterEach`.

Coverage >= 80% cho file mới. Test độc lập (reset state trong `beforeEach`/`afterEach`), assertion cụ thể theo hành vi. Không skip test bằng `test.skip` mà không giải thích lý do. Không commit code mới thiếu test.
