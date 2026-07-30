import * as Sentry from '@sentry/nextjs';

/**
 * Sentry phía trình duyệt — nơi bắt được đúng loại lỗi mà QC của dự án hay gặp:
 * component crash, WebSocket không connect, request bị CORS chặn.
 *
 * `NEXT_PUBLIC_*` được bake vào lúc build, nên đổi biến trên Vercel xong phải
 * trigger rebuild mới có tác dụng.
 */
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    tracesSampleRate: 0,
    // Không gửi IP người dùng; cũng không bật Session Replay (quota free tier
    // hết rất nhanh và replay ghi lại cả nội dung màn hình).
    sendDefaultPii: false,
  });
}

/** Next.js dùng hook này để đo điều hướng phía client. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
