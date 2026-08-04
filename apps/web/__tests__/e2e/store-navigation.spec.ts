import { test, expect } from '@playwright/test';
import { STORE_STATE } from './auth.paths';

/**
 * Journey console quán cho STORE_ADMIN — chuỗi điều hướng mà bug PR #53 từng
 * sống trong đó (socket chết khi rời trang, bấm phát trả 201 nhưng im lặng).
 * Phạm vi đợt này KHÔNG assert nhạc phát thật (không có <audio> trong DOM,
 * track fixture mang s3Key giả, autoplay policy) — chỉ ghim rằng đi qua lại
 * giữa các trang con của /store không vỡ gì và dữ liệu đúng vai trò.
 */
test.use({ storageState: STORE_STATE });

test.describe('store console navigation', () => {
  test('walks through every /store page without losing the shell', async ({ page }) => {
    await page.goto('/store');
    // Sidebar console quán: đúng bộ nav của storeNavItems.
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
    await expect(nav.getByRole('link', { name: 'Trang chủ' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Playlists' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Kho nhạc' })).toBeVisible();

    // Trang chủ quán render khối "Phát tại quán" với playlist fixture.
    await expect(page.getByRole('heading', { name: 'Phát tại quán' })).toBeVisible();
    await expect(page.getByText('E2E Smoke Playlist').first()).toBeVisible();

    // /store → /store/playlists
    await nav.getByRole('link', { name: 'Playlists' }).click();
    await expect(page).toHaveURL(/\/store\/playlists$/);
    await expect(page.getByText('E2E Smoke Playlist').first()).toBeVisible();

    // /store/playlists → /store/playlists/[id] (đúng chặng của bug PR #53)
    await page.getByText('E2E Smoke Playlist').first().click();
    await expect(page).toHaveURL(/\/store\/playlists\/[a-z0-9]+/);
    await expect(page.getByText('E2E Smoke Track').first()).toBeVisible();

    // → /store/tracks
    await nav.getByRole('link', { name: 'Kho nhạc' }).click();
    await expect(page).toHaveURL(/\/store\/tracks$/);
    await expect(page.getByText('E2E Smoke Track').first()).toBeVisible();

    // → quay về trang chủ, shell còn nguyên
    await nav.getByRole('link', { name: 'Trang chủ' }).click();
    await expect(page).toHaveURL(/\/store$/);
    await expect(page.getByRole('heading', { name: 'Phát tại quán' })).toBeVisible();
  });

  test('does not show chain-level admin nav to a store admin', async ({ page }) => {
    await page.goto('/store');
    const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });

    // storeNavItems không có Quán / Người dùng — đó là việc của ORG_ADMIN.
    await expect(nav.getByRole('link', { name: 'Quán' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Người dùng' })).toHaveCount(0);
  });

  test('reaches the settings page from the account block', async ({ page }) => {
    await page.goto('/store/settings');
    await expect(page).toHaveURL(/\/store\/settings/);
    // Trang Cài đặt có section hồ sơ — đủ đặc trưng để biết không bị redirect.
    await expect(page.getByText('store1@cafe.com').first()).toBeVisible();
  });
});
