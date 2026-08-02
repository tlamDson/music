import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

/**
 * `withSentryConfig` BỌC config ở trên chứ không thay thế — security header
 * thêm ở PR #15 phải còn nguyên sau khi bọc. Kiểm chứng bằng `curl -I` sau khi
 * deploy, đừng tin suông.
 *
 * Không có `SENTRY_AUTH_TOKEN` (local, CI, PR preview) thì bước upload source
 * map tự bỏ qua và build vẫn chạy — chỉ Vercel production mới cần token.
 */
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Bản build đã minify không đọc được stack trace — không upload source map
  // thì coi như không có error tracking.
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  silent: !process.env.CI,
  // Bỏ code log debug của Sentry khỏi bundle gửi xuống trình duyệt.
  webpack: { treeshake: { removeDebugLogging: true } },
});
