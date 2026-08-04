import path from 'path';

/**
 * Đường dẫn storageState dùng chung giữa auth.setup.ts (ghi) và các spec (đọc
 * qua `test.use({ storageState })`). Tách file riêng vì Playwright cấm test
 * file import test file khác — auth.setup.ts là test file (project `setup`).
 */
export const AUTH_DIR = path.resolve(__dirname, '.auth');
export const ADMIN_STATE = path.join(AUTH_DIR, 'admin.json');
export const STORE_STATE = path.join(AUTH_DIR, 'store.json');
