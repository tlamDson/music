import { dashboardNavItems, storeNavItems, homePathFor, settingsPathFor } from '../../src/lib/nav';

describe('nav items by role', () => {
  const labels = (items: { label: string }[]) => items.map((item) => item.label);

  it('gives an org admin the chain-wide sections', () => {
    expect(labels(dashboardNavItems('ORG_ADMIN'))).toEqual(
      expect.arrayContaining(['Quán', 'Người dùng']),
    );
  });

  // Yêu cầu chính: quán không được đụng vào quán khác của cả chuỗi
  it('hides stores and users from a store admin', () => {
    const items = labels(dashboardNavItems('STORE_ADMIN'));

    expect(items).not.toContain('Quán');
    expect(items).not.toContain('Người dùng');
  });

  it('still lets a store admin reach playlists and the track library', () => {
    expect(labels(storeNavItems())).toEqual(['Trang chủ', 'Playlists', 'Kho nhạc']);
  });

  it('sends a store admin to their own console after login', () => {
    expect(homePathFor('STORE_ADMIN')).toBe('/store');
    expect(homePathFor('ORG_ADMIN')).toBe('/dashboard');
  });

  it('sends each role to its own settings page', () => {
    expect(settingsPathFor('STORE_ADMIN')).toBe('/store/settings');
    expect(settingsPathFor('ORG_ADMIN')).toBe('/dashboard/settings');
  });
});
