import { execSync } from 'child_process';
import path from 'path';

/**
 * Chuẩn bị DB cho e2e: migrate + seed + fixture playlist/track.
 *
 * Chỉ đụng database (Postgres dev 5432, cùng DB với `pnpm dev`), không gọi tới
 * server nào — nên không phụ thuộc thứ tự Playwright khởi động webServer trước
 * hay sau globalSetup. Cả ba lệnh đều idempotent, chạy lại không nhân đôi data.
 *
 * Đăng nhập + storageState KHÔNG nằm ở đây mà ở auth.setup.ts (project `setup`)
 * — bước đó cần backend sống, mà project thì chắc chắn chạy sau khi webServer
 * sẵn sàng.
 */
export default function globalSetup() {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const run = (command: string) => execSync(command, { cwd: repoRoot, stdio: 'inherit' });

  run('pnpm --filter @cafe-music/backend exec prisma migrate deploy');
  run('pnpm --filter @cafe-music/backend prisma:seed');
  run('pnpm --filter @cafe-music/backend prisma:e2e-fixtures');
}
