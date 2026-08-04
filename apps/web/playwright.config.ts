import { defineConfig, devices } from '@playwright/test';

/**
 * E2E chạy TAY trước mỗi release (không có job CI — quyết định có chủ đích:
 * dựng đủ backend + web + Postgres + Redis trong CI vừa chậm vừa flaky, tầng
 * này ít test và chỉ cần chạy trước khi cắt release develop → main).
 *
 * Yêu cầu trước khi chạy: `docker compose up -d` (Postgres 5432 + Redis 6379
 * của DEV — e2e dùng chung hạ tầng với `pnpm dev`, không phải cặp *_test).
 * Seed + fixture tự chạy trong global-setup.
 */
export default defineConfig({
  testDir: './__tests__/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  // Next dev compile từng trang ở lần mở đầu tiên — /store lần đầu có thể mất
  // hơn 30s (mặc định của Playwright), nên nới cả timeout test lẫn expect.
  timeout: 90_000,
  expect: { timeout: 15_000 },

  // Seed DB + fixture playlist/track qua prisma CLI — chỉ đụng database, không
  // cần server nào sống, nên miễn nhiễm với thứ tự webServer/globalSetup.
  globalSetup: './__tests__/e2e/global-setup.ts',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Đăng nhập qua API một lần, ghi storageState — mỗi test tự login sẽ đụng
    // rate limit 5 login/60s theo email (PR #68) và ăn 429 giữa suite.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  // Backend PHẢI nằm trong danh sách: config cũ chỉ khởi động web nên mọi API
  // call chết lặng — bug lộ ra dưới dạng "trang trắng" chứ không phải lỗi rõ.
  webServer: [
    {
      command: 'pnpm --filter @cafe-music/backend dev',
      cwd: '../..',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
