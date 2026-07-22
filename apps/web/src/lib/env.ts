/**
 * Backend lắng nghe ở cổng 4000 và đặt global prefix `/api/v1`
 * (xem apps/backend/src/main.ts).
 */
export const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';
export const DEFAULT_WS_URL = 'http://localhost:4000';

function orDefault(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

/**
 * Nhận sẵn giá trị thay vì tự đọc `process.env` bên trong: Next.js chỉ thay
 * `process.env.NEXT_PUBLIC_*` khi nó xuất hiện nguyên văn trong source, nên
 * literal đó phải nằm ở nơi gọi.
 */
export function resolveApiBaseUrl(value: string | undefined): string {
  return orDefault(value, DEFAULT_API_BASE_URL).replace(/\/+$/, '');
}

export function resolveWsUrl(value: string | undefined): string {
  // Bỏ dấu `/` cuối để `${WS_URL}/sync` không thành `//sync`
  return orDefault(value, DEFAULT_WS_URL).replace(/\/+$/, '');
}
