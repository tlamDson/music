/**
 * Nhãn hiển thị tiếng Việt cho vai trò — giá trị gửi lên API (`role` raw:
 * `ORG_ADMIN` / `STORE_ADMIN`) giữ nguyên, chỉ đổi chữ hiển thị cho người dùng.
 */
export const ROLE_LABELS: Record<string, string> = {
  ORG_ADMIN: 'Quản lý chuỗi',
  STORE_ADMIN: 'Quản lý quán',
};

export const ROLE_COLORS: Record<string, string> = {
  ORG_ADMIN: 'rgba(67,56,202,0.8)',
  STORE_ADMIN: 'rgba(34,197,94,0.8)',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
