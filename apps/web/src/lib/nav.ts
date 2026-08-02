import type { UserRole } from '@cafe-music/shared';
import type { Translator } from './format';

export interface NavItem {
  href: string;
  label: string;
}

/**
 * Nav của console quản trị. Quán và Người dùng là việc của cả chuỗi nên chỉ
 * ORG_ADMIN thấy — store admin có console riêng ở `/store`. `t` là translator
 * namespace `nav` (`useTranslations('nav')`), truyền từ call site vì đây là
 * hàm thuần, không phải component/hook.
 */
export function dashboardNavItems(role: UserRole, t: Translator): NavItem[] {
  const items: NavItem[] = [
    { href: '/dashboard', label: t('overview') },
    { href: '/dashboard/playlists', label: t('playlists') },
    { href: '/dashboard/tracks', label: t('tracks') },
  ];

  if (role === 'ORG_ADMIN' || role === 'SUPER_ADMIN') {
    items.push(
      { href: '/dashboard/stores', label: t('stores') },
      { href: '/dashboard/users', label: t('users') },
    );
  }

  return items;
}

/** Nav của console quán: không quản lý quán khác, không quản lý người dùng. */
export function storeNavItems(t: Translator): NavItem[] {
  return [
    { href: '/store', label: t('home') },
    { href: '/store/playlists', label: t('playlists') },
    { href: '/store/tracks', label: t('tracks') },
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
