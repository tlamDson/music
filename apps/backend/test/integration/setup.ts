import { execSync } from 'child_process';

const DEFAULT_TEST_URL =
  'postgresql://postgres:postgres@localhost:5433/cafe_music_test?schema=public';

/**
 * globalSetup: dựng schema cho DB test trước khi chạy suite.
 *
 * Bản trước fallback `process.env.DATABASE_URL || <test url>` — nghĩa là dev nào
 * đã export `DATABASE_URL` (trỏ DB dev ở cổng 5432) thì suite này **migrate rồi
 * TRUNCATE thẳng vào DB dev của họ**. Giờ chỉ đọc `DATABASE_TEST_URL`, và chặn
 * cứng nếu URL không trỏ tới database test.
 */
export default function globalSetup() {
  const url = process.env.DATABASE_TEST_URL ?? DEFAULT_TEST_URL;

  if (!url.includes('cafe_music_test')) {
    throw new Error(
      `DATABASE_TEST_URL phải trỏ tới database "cafe_music_test" (đang là: ${url}).\n` +
        'Integration test sẽ TRUNCATE toàn bộ bảng — từ chối chạy trên database khác.',
    );
  }

  process.env.DATABASE_URL = url;

  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env },
      stdio: 'inherit',
    });
  } catch {
    throw new Error(
      'prisma migrate deploy thất bại — kiểm tra container postgres_test đã chạy chưa:\n' +
        '  docker compose up -d postgres_test redis_test',
    );
  }
}
