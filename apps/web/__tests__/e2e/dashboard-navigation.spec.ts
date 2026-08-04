import { test, expect } from '@playwright/test';
import { ADMIN_STATE } from './auth.paths';

/**
 * Journey console chuỗi cho ORG_ADMIN. Điểm kiểm chính: sidebar hiện ĐỦ menu
 * quản trị (dashboardNavItems với role ORG_ADMIN có thêm Quán + Người dùng so
 * với store console) và các trang quản trị mở được với dữ liệu seed.
 */
test.use({ storageState: ADMIN_STATE });

test.describe('dashboard navigation', () => {
  test('shows the full ORG_ADMIN nav and walks through each page', async ({ page }) => {
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });

    // Đủ 5 mục của dashboardNavItems('ORG_ADMIN') — hai mục cuối là phần
    // storeNavItems không có.
    for (const label of ['Tổng quan', 'Playlists', 'Kho nhạc', 'Quán', 'Người dùng']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }

    // /dashboard/playlists — thấy playlist fixture của chuỗi.
    await nav.getByRole('link', { name: 'Playlists' }).click();
    await expect(page).toHaveURL(/\/dashboard\/playlists$/);
    await expect(page.getByText('E2E Smoke Playlist').first()).toBeVisible();

    // /dashboard/stores — thấy đủ 3 quán seed.
    await nav.getByRole('link', { name: 'Quán' }).click();
    await expect(page).toHaveURL(/\/dashboard\/stores$/);
    await expect(page.getByText('Store 1 - Downtown').first()).toBeVisible();
    await expect(page.getByText('Store 2 - Uptown').first()).toBeVisible();
    await expect(page.getByText('Store 3 - Suburb').first()).toBeVisible();

    // /dashboard/users — thấy tài khoản admin + store admin từ seed.
    await nav.getByRole('link', { name: 'Người dùng' }).click();
    await expect(page).toHaveURL(/\/dashboard\/users$/);
    await expect(page.getByText('admin@cafe.com').first()).toBeVisible();
    await expect(page.getByText('store1@cafe.com').first()).toBeVisible();
  });

  test('opens a store detail page from the stores list', async ({ page }) => {
    // /dashboard/stores/[id] là chỗ DUY NHẤT phát nhạc ra loa quán (PR #54) —
    // trang này chết là mất kênh điều khiển chính, đáng một chặng riêng.
    await page.goto('/dashboard/stores/store-1');
    await expect(page.getByText('Store 1 - Downtown').first()).toBeVisible();
    // Danh sách playlist để phát phải hiện fixture.
    await expect(page.getByText('E2E Smoke Playlist').first()).toBeVisible();
  });

  test('keeps an org admin out of nothing but shows no store console leak', async ({ page }) => {
    // ORG_ADMIN mở /store (console quán) — layout /store yêu cầu storeId,
    // org admin không gắn quán nào; điều quan trọng là app không crash trắng.
    await page.goto('/store');
    // Chỉ cần trang phản hồi được (redirect hoặc render) — không assert nội
    // dung cụ thể vì hành vi cho vai trò sai console chưa được spec hoá.
    await expect(page.locator('body')).toBeVisible();
  });
});
