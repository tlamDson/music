# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/); phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

## [0.1.0] — 2026-08-01

Bản phát hành production đầu tiên.

### Nền tảng phát nhạc

- **Quán (`Store`) là đơn vị phát.** Điều khiển qua `POST /sync/stores/:id/play|pause|resume|next|previous|stop`, trạng thái nằm ở Redis (TTL 24h), broadcast qua room WebSocket `store:<id>`.
- **Chuyển bài do server lái** theo `durationMs` của track, không phải client bắt sự kiện `ended` — quán mở hai màn hình không còn bị nhạc nhảy cóc, và không mở màn nào thì nhạc vẫn chạy tiếp.
- Lặp lại (`OFF`/`ALL`/`ONE`), phát ngẫu nhiên và "bài trước" kiểu Spotify (đã phát > 3s thì tua về đầu bài), tất cả quyết định ở server nên mọi màn hình của quán thấy cùng một trạng thái.
- Lịch phát theo quán (`PlaylistSchedule`).
- `GET /sync/stores/:id/now-playing` để client mở trang sau lúc admin bấm phát vẫn dựng lại được thanh phát.

### Quản lý nội dung & người dùng

- Upload track lên S3/R2 kèm thời lượng, phạm vi theo chuỗi hoặc theo quán.
- Playlist có thư mục, sắp xếp lại bài, tìm kiếm và tổng thời lượng.
- Ba vai trò (`SUPER_ADMIN`/`ORG_ADMIN`/`STORE_ADMIN`) với phạm vi dữ liệu tách theo tổ chức và quán.
- Tạo/sửa/vô hiệu hoá tài khoản. `User.isActive` được kiểm ở cả `login`, `refreshTokens` và mỗi request có JWT — access token còn hạn của tài khoản vừa bị vô hiệu hoá bị từ chối ngay, không cần token blocklist.

### Giao diện

- Console chuỗi ở `/dashboard`, console quán ở `/store`, màn chiếu TV ở `/player/[storeId]?kiosk=1`.
- Layout kiểu Spotify: sidebar thư viện cố định, bảng track dùng chung, thanh phát cố định với shuffle/prev/play/next/repeat, màn "Đang phát" toàn màn hình dùng Fullscreen API thật.
- Mobile: sidebar thành drawer, thanh phát thu về mini-player một hàng.
- Hệ thống motion (token `--duration-*`/`--ease-*`, skeleton loading, stagger) tôn trọng `prefers-reduced-motion` — tắt **cả** delay, không chỉ duration.
- Vị trí phát tách khỏi context chính (`usePlayerPosition`) nên bảng track dài không re-render vài lần mỗi giây khi đang phát nhạc.

### Bảo mật & vận hành

- Validate biến môi trường bằng Zod lúc khởi động; helmet; CORS production chỉ nhận đúng một origin cho cả HTTP lẫn WebSocket; phân quyền khi join room WS.
- **Rate limit login đếm theo tài khoản bị dò, không theo IP.** Đếm theo IP không chặn được brute-force trên Railway vì edge round-robin qua nhiều địa chỉ nên `req.ip` của cùng một client không ổn định. Counter nằm ở Redis nên sống sót qua mỗi lần thay container.
- Error tracking bằng Sentry (backend + web), chỉ gửi 5xx, redact body của `/auth/login` và `/auth/refresh`.
- Backup database hai lớp: snapshot của Railway + `pg_dump` hằng ngày lên Cloudflare R2 (giữ 30 ngày), kèm script restore.
- Health check `/api/v1/health` (liveness) và `/api/v1/health/ready` (DB + Redis, có timeout để không treo khi Redis chết).
- Log JSON có request id, tự redact credential.
- Migration tự chạy lúc container khởi động; Docker image riêng cho backend; CI ba job (lint + unit test, typecheck + build, docker build).
- Tài khoản đầu tiên của production tạo bằng `prisma:bootstrap` (idempotent, không có dữ liệu demo); `prisma:seed` từ chối chạy khi `NODE_ENV=production`.

### Giới hạn đã biết

- Chưa có bảng `Artist` nên không có cột Album hay trang nghệ sĩ.
- Track upload với `durationMs = 0` không tự chuyển bài được — quán sẽ kẹt ở trạng thái "đang phát".
- Timer chuyển bài nằm trong bộ nhớ process nên **chỉ đúng khi chạy 1 instance backend**.
- `SchedulerService.matchesCron` bỏ qua phần ngày/tháng/thứ.
- Refresh token (hạn 7 ngày) chưa thu hồi được.
- Rate limit theo tài khoản không chặn kiểu rải mật khẩu qua nhiều tài khoản khác nhau.
