import * as Sentry from '@sentry/nextjs';

/**
 * Hook của Next.js chạy một lần lúc server khởi động (cả runtime Node lẫn Edge).
 * Không có DSN (local, CI) thì `Sentry.init` không được gọi và app chạy bình thường.
 */
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Staging và production đều là bản build production của Next — thiếu biến
    // này thì hai môi trường trộn lẫn trong Sentry.
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });

  await Promise.resolve();
}

/**
 * Next.js gọi hàm này cho mọi lỗi phát sinh khi render trên server. Không khai
 * báo thì lỗi server-side không bao giờ tới Sentry.
 */
export const onRequestError = Sentry.captureRequestError;
