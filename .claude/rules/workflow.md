# Workflow — Git Flow, Commit, PR, TDD

## Quy tắc bất di bất dịch

1. **Mọi thay đổi đều phải qua PR.** Không bao giờ commit thẳng vào `develop` hay `main`. Có gì cần commit → tạo nhánh mới → commit → push → mở PR vào `develop`.
2. **`main` do chủ repo quản lý.** Claude/dev **không được** merge vào `main` dưới bất kỳ hình thức nào (kể cả khi CI xanh). PR `develop → main` chỉ chủ repo tự thực hiện khi release.
3. **Chỉ merge PR vào `develop` khi CI + toàn bộ test pass.** Bắt buộc xác nhận **cả 3 job** đã xanh: `Lint + Unit Tests`, `Typecheck + Build`, `Backend Docker Build`. CI đỏ hoặc đang chạy → không merge, đợi hoặc fix.
4. **Cập nhật `CLAUDE.md` và `.claude/rules/*` khi task làm thay đổi convention/tooling**, để lần sau còn áp dụng đúng.
5. **Sửa bug quan sát được qua trình duyệt (UI/frontend, hoặc backend bug lộ ra qua UI) phải verify bằng `chrome-devtools` MCP cả trước lẫn sau khi fix** — xem mục [Debug bug](#debug-bug--verify-bằng-chrome-devtools-mcp).

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

#### PR release `develop → main` phải merge bằng MERGE COMMIT, không squash

Squash là mặc định đúng cho PR feature vào `develop`, nhưng **sai cho PR release vào `main`** — và hậu quả chỉ lộ ra ở lần release **kế tiếp**.

Đã dẫm phải thật: PR #75 (`chore: release v0.1.0 to production`) merge bằng squash, nên `main` chỉ có **một** commit không hề liên quan tới 40 commit riêng lẻ của `develop`. Git tính lại merge-base thành `d33a7d9` — commit **trước** lúc release — nên khi mở PR release `v0.2.0` (#95), hai phía trông như cùng viết lại y hệt các file đó:

- **~65 file conflict** dù nội dung hai bên giống hệt nhau.
- **GitHub Actions không chạy một job nào** — PR ở trạng thái `mergeable_state: dirty` thì GitHub không dựng được merge ref, nên cả 3 required check không bao giờ xuất hiện (không phải "đang chờ", mà là **không tồn tại**). Chỉ app ngoài như GitGuardian/Vercel báo cáo.
- Tab _Files changed_ hiện **401 file** thay vì 104 file thật, vì GitHub dùng diff ba chấm tính từ merge-base cũ. Người review tưởng release kéo theo cả đợt đã phát hành trước đó.

**Cách nhận ra:** `mergeable_state` là `dirty`, và `GET /repos/:o/:r/actions/runs?head_sha=<sha>` trả `total_count: 0`.

**Cách gỡ nếu đã lỡ squash** (đã làm ở PR #96): tạo nhánh từ `develop`, `git merge -s ours origin/main`, PR vào `develop`, merge bằng **merge commit**. Strategy `ours` chỉ an toàn khi chứng minh được `main` không có nội dung nào `develop` thiếu — kiểm bằng cách so tree hash của `main` với commit `develop` lúc cắt release:

```bash
git rev-parse origin/main^{tree} <commit-cắt-release>^{tree}   # hai hash phải bằng nhau
git merge-base --is-ancestor <commit-cắt-release> origin/develop
git diff --stat origin/develop HEAD   # sau khi merge phải RỖNG — không đổi file nào
```

Hai lệnh đầu bằng nhau/đúng thì `main` không đóng góp nội dung gì, `-s ours` không mất gì. **Đừng chạy `-s ours` mà bỏ qua bước kiểm này** — nếu ai đó từng hotfix thẳng lên `main`, nó sẽ nuốt mất hotfix đó mà không báo gì.

### Sửa `ci-pr.yml` — đừng làm mất required check

Tên ba job trong [.github/workflows/ci-pr.yml](../../.github/workflows/ci-pr.yml) **chính là** định danh required status check phía GitHub (branch protection không có file config trong repo). Vì vậy:

- **Không đổi tên** `Lint + Unit Tests` / `Typecheck + Build` / `Backend Docker Build`. Cần tách việc thì thêm job mới tên khác.
- **Không thêm `paths:` vào `on: pull_request`** — workflow sẽ không chạy, check treo ở _Expected_ vĩnh viễn và PR **không merge được**.
- **Không đặt `if:` ở cấp job** cho ba job này. Muốn bỏ qua việc nặng thì gate ở cấp **step**, để job vẫn chạy và vẫn kết thúc Success.

Mẫu đang dùng: job `changes` (`dorny/paths-filter`, pin theo commit SHA) xuất `outputs.backend`; job `docker` đặt `env.SHOULD_BUILD` rồi gắn `if: env.SHOULD_BUILD == 'true'` lên từng step build, kèm một step `echo` cho nhánh còn lại. PR chỉ sửa web/docs vì thế xanh trong ~15s thay vì 3–5 phút. PR target `main` luôn build thật, không tin vào filter.

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

## Debug bug — verify bằng chrome-devtools MCP

Khi xử lý bug quan sát được qua trình duyệt (lỗi UI, lỗi hành vi frontend, hoặc bug backend chỉ lộ ra khi thao tác trên web app), **bắt buộc dùng MCP `chrome-devtools`** (xem bảng MCP Servers trong `CLAUDE.md`) ở cả hai đầu:

1. **Trước khi sửa — tái hiện bug thật:** mở đúng trang bằng `navigate_page`, thực hiện lại thao tác gây lỗi, và xác nhận bug bằng ít nhất một trong `take_screenshot` / `take_snapshot` / `list_console_messages` / `list_network_requests`. Đừng suy đoán nguyên nhân chỉ từ đọc code — quan sát trạng thái thật trước.
2. **Sau khi sửa — verify lại, không tự cho là xong:** lặp lại đúng thao tác đã gây bug ở bước 1 trên trang đã có fix, xác nhận lỗi hết (console sạch, network đúng response, UI đúng như kỳ vọng) trước khi báo hoàn thành hoặc mở PR.
3. Nhóm tool đọc (`screenshot`, `snapshot`, `console`, `network`) auto-allow; `navigate_page` / `click` / gõ phím / `evaluate_script` vẫn cần xác nhận từng lần — cứ gọi bình thường, đợi user duyệt.
4. Bug không thể quan sát qua trình duyệt (thuần backend, không có mặt UI/network quan sát được — ví dụ logic nội bộ của một cron job) thì verify bằng test (TDD ở trên) thay vì chrome-devtools.

Việc verify này là bắt buộc, không phải tuỳ chọn — không báo "đã fix" nếu chưa tái hiện lại thao tác gây bug bằng chrome-devtools sau khi sửa.
