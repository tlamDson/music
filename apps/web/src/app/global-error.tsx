'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Lưới an toàn cuối cùng của App Router: bắt lỗi render mà không `error.tsx`
 * nào phía dưới xử lý được. Thiếu file này thì component crash — đúng loại lỗi
 * QC của dự án hay gặp nhất — không bao giờ tới được Sentry.
 *
 * `global-error` thay thế cả root layout khi nó render, nên phải tự dựng
 * `<html>`/`<body>`.
 *
 * **Ngoại lệ có chủ đích, không dùng next-intl ở đây (PR i18n).** File này bắt
 * buộc là Client Component (Next.js yêu cầu `error`/`reset` props phải vậy) và
 * đứng ngoài cây layout gốc — không gọi được `cookies()` từ `next/headers` để
 * đọc locale (server-only). Thêm logic đọc `document.cookie` phía client vào
 * đúng chỗ ứng dụng đã crash là rủi ro không đáng cho một màn hình hiếm gặp.
 * Giữ nguyên tiếng Việt hardcode + `lang="vi"`.
 */
export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="vi" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col items-center justify-center gap-4 p-6 text-center"
        style={{
          backgroundColor: 'var(--color-background)',
          color: 'var(--color-foreground)',
        }}
      >
        <h1 className="text-xl font-semibold">Đã có lỗi xảy ra</h1>
        <p style={{ color: 'var(--color-foreground)', opacity: 0.7 }}>
          Lỗi đã được ghi nhận. Vui lòng tải lại trang.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="press cursor-pointer rounded-md px-4 py-2 font-medium"
          style={{
            backgroundColor: 'var(--color-secondary)',
            color: 'var(--color-on-primary)',
          }}
        >
          Tải lại trang
        </button>
      </body>
    </html>
  );
}
