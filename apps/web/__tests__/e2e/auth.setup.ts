import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import { ADMIN_STATE, AUTH_DIR, STORE_STATE } from './auth.paths';

const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://localhost:4000/api/v1';
const WEB_ORIGIN = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

// Tài khoản từ prisma:seed (fallback dev trong seed-credentials.ts).
const ADMIN = { email: 'admin@cafe.com', password: 'Admin@123456' };
const STORE = { email: 'store1@cafe.com', password: 'Store@123456' };

/**
 * Đăng nhập MỘT lần qua API rồi ghi storageState cho các test dùng lại.
 *
 * - Không login qua form ở mỗi test: `/auth/login` bị throttle 5 lần/60s theo
 *   email (PR #68) — suite tự login từng test sẽ ăn 429 giữa chừng.
 * - Token của app nằm ở localStorage (không phải cookie), storageState của
 *   Playwright hỗ trợ localStorage theo origin nên tự build được file state.
 */
async function saveState(file: string, tokens: { accessToken: string; refreshToken: string }) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      cookies: [
        // Chốt locale vi để selector theo text không phụ thuộc máy chạy test.
        {
          name: 'NEXT_LOCALE',
          value: 'vi',
          domain: 'localhost',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [
        {
          origin: WEB_ORIGIN,
          localStorage: [
            { name: 'accessToken', value: tokens.accessToken },
            { name: 'refreshToken', value: tokens.refreshToken },
          ],
        },
      ],
    }),
  );
}

setup('authenticate org admin and store admin', async ({ request }) => {
  for (const [account, file] of [
    [ADMIN, ADMIN_STATE],
    [STORE, STORE_STATE],
  ] as const) {
    const res = await request.post(`${API_URL}/auth/login`, { data: account });
    expect(
      res.ok(),
      `Login ${account.email} thất bại (${res.status()}) — backend đã chạy và DB đã seed chưa?`,
    ).toBe(true);
    await saveState(file, await res.json());
  }
});
