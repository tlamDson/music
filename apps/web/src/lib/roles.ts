import type { Translator } from './format';

export const ROLE_COLORS: Record<string, string> = {
  ORG_ADMIN: 'rgba(67,56,202,0.8)',
  STORE_ADMIN: 'rgba(34,197,94,0.8)',
};

/**
 * Nhãn hiển thị cho vai trò — giá trị gửi lên API (`role` raw: `ORG_ADMIN` /
 * `STORE_ADMIN`) giữ nguyên, chỉ đổi chữ hiển thị. `t` là translator namespace
 * `common` (đọc key `roles.*`), truyền từ call site vì đây là hàm thuần.
 */
export function roleLabel(role: string, t: Translator): string {
  if (role === 'ORG_ADMIN') return t('roles.orgAdmin');
  if (role === 'STORE_ADMIN') return t('roles.storeAdmin');
  return role;
}
