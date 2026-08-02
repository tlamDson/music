import type { UserRole } from '@cafe-music/shared';

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Nav của console quản trị. Quán và Người dùng là việc của cả chuỗi nên chỉ
 * ORG_ADMIN thấy — store admin có console riêng ở `/store`.
 */
export function dashboardNavItems(role: UserRole): NavItem[] {
  const items: NavItem[] = [
    { href: '/dashboard', label: 'Tổng quan' },
    { href: '/dashboard/playlists', label: 'Playlists' },
    { href: '/dashboard/tracks', label: 'Kho nhạc' },
  ];

  if (role === 'ORG_ADMIN' || role === 'SUPER_ADMIN') {
    items.push(
      { href: '/dashboard/stores', label: 'Quán' },
      { href: '/dashboard/users', label: 'Người dùng' },
    );
  }

  return items;
}

/** Nav của console quán: không quản lý quán khác, không quản lý người dùng. */
export function storeNavItems(): NavItem[] {
  return [
    { href: '/store', label: 'Trang chủ' },
    { href: '/store/playlists', label: 'Playlists' },
    { href: '/store/tracks', label: 'Kho nhạc' },
  ];
}

/** Đường dẫn mặc định sau khi đăng nhập, theo vai trò. */
export function homePathFor(role: UserRole): string {
  return role === 'STORE_ADMIN' ? '/store' : '/dashboard';
}

/** Trang Cài đặt cá nhân — không thêm vào nav chính, vào từ khối tài khoản ở đáy sidebar. */
export function settingsPathFor(role: UserRole): string {
  return role === 'STORE_ADMIN' ? '/store/settings' : '/dashboard/settings';
}
