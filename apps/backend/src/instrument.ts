import * as Sentry from '@sentry/nestjs';

/**
 * Khởi tạo Sentry. File này PHẢI được import ở dòng đầu tiên của `main.ts`,
 * trước cả `AppModule` — Sentry vá (instrument) các thư viện ở thời điểm chúng
 * được require, nên nạp sau thì phần lớn instrumentation không gắn được.
 *
 * Không có `SENTRY_DSN` (local, CI, test) thì `Sentry.init` không được gọi và
 * app chạy bình thường — đây là lý do biến này optional trong `env.schema.ts`.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Staging và production ĐỀU chạy NODE_ENV=production, nên nếu không có biến
    // này thì hai môi trường trộn lẫn trong Sentry và không biết lỗi từ đâu.
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    // Không bật performance tracing: free tier tính quota theo cả transaction,
    // mà thứ cần ở đây là lỗi.
    tracesSampleRate: 0,
    // Không gửi IP/cookie/header của người dùng. pino đã redact credential —
    // Sentry phải giữ cùng mức, xem thêm `beforeSend`.
    sendDefaultPii: false,
    beforeSend: scrubAuthPayloads,
  });
}

/**
 * Body của `/auth/login` và `/auth/refresh` mang mật khẩu và refresh token —
 * không được để chúng rời khỏi server, kể cả khi request đó gây ra lỗi 500.
 */
export function scrubAuthPayloads<
  T extends { request?: { url?: string; data?: unknown } },
>(event: T): T {
  const url = event.request?.url;
  if (url && /\/auth\/(login|refresh)/.test(url) && event.request) {
    event.request.data = '[redacted]';
  }
  return event;
}
