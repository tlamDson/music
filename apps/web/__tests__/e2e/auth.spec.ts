import { test, expect } from '@playwright/test';

// Tài khoản từ prisma:seed — xem auth.setup.ts.
const ADMIN = { email: 'admin@cafe.com', password: 'Admin@123456' };
const STORE = { email: 'store1@cafe.com', password: 'Store@123456' };

/**
 * Suite này KHÔNG dùng storageState — đối tượng kiểm là chính form login và
 * luồng redirect quanh nó, nên mỗi test bắt đầu chưa đăng nhập.
 *
 * Lưu ý rate limit: `/auth/login` bị throttle 5 lần/60s THEO EMAIL. Suite này
 * chỉ login thật 2 lần (mỗi email một lần); test sai mật khẩu dùng email không
 * tồn tại để không ăn chung counter với hai tài khoản seed.
 */
test.describe('login flow', () => {
  test('redirects an unauthenticated visitor from / to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('form', { name: 'Đăng nhập' })).toBeVisible();
  });

  test('redirects an unauthenticated visitor away from a protected page', async ({ page }) => {
    await page.goto('/dashboard');
    // Guard nằm ở client (useAuth trong layout) — chờ redirect chạy xong.
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows the error inline on wrong credentials without leaving the page', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('khong-ton-tai@cafe.com');
    await page.locator('#password').fill('sai-mat-khau-123');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // Lỗi phải hiện TẠI CHỖ qua role="alert" — không đá sang trang khác
    // (api-client chỉ auto-logout với 401 ngoài /auth/login).
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('sends an ORG_ADMIN to /dashboard after login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ADMIN.email);
    await page.locator('#password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // homePathFor('ORG_ADMIN') = /dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('sends a STORE_ADMIN to /store after login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(STORE.email);
    await page.locator('#password').fill(STORE.password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // homePathFor('STORE_ADMIN') = /store — nhánh còn lại của cùng một hàm.
    await expect(page).toHaveURL(/\/store/);
  });
});
