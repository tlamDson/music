/**
 * Chạy qua `setupFiles` — tức là TRƯỚC khi bất kỳ spec nào import `AppModule`.
 *
 * Bắt buộc phải có: `validateEnv` (src/config/env.schema.ts) crash ngay lúc boot
 * nếu thiếu biến, và `ConfigModule.forRoot` không set `ignoreEnvFile` nên ở local
 * dotenv âm thầm đọc `apps/backend/.env` và che mất vấn đề. File đó gitignore,
 * CI không có → boot sẽ crash ở CI trong khi local xanh. Set tường minh ở đây để
 * hai môi trường chạy cùng một cấu hình.
 */

// Postgres tmpfs ở cổng 5433 (docker-compose service `postgres_test`).
process.env.DATABASE_URL =
  process.env.DATABASE_TEST_URL ??
  'postgresql://postgres:postgres@localhost:5433/cafe_music_test?schema=public';

// Redis riêng ở 6380 (service `redis_test`) — KHÔNG dùng 6379 của dev.
process.env.REDIS_URL = process.env.REDIS_TEST_URL ?? 'redis://localhost:6380';

// Đủ 32 ký tự (env.schema.ts từ chối ngắn hơn), cùng pattern placeholder với
// env.schema.spec.ts — chuỗi lặp một ký tự để scanner secret không báo nhầm.
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';

process.env.WEB_URL = 'http://localhost:3000';

// S3Service bị override bằng stub trong helpers/app.ts nên giá trị chỉ cần hợp
// lệ về mặt schema, không cần trỏ tới MinIO thật.
process.env.S3_ENDPOINT = 'http://localhost:9000';
process.env.S3_REGION = 'us-east-1';
process.env.S3_BUCKET = 'cafe-music-test';
process.env.S3_ACCESS_KEY = 'test-access-key';
process.env.S3_SECRET_KEY = 'test-secret-key';

process.env.NODE_ENV = 'test';
// pino-pretty chạy trong worker thread và làm log test không đọc nổi.
process.env.LOG_LEVEL = 'silent';

// Không gửi gì lên Sentry từ test.
delete process.env.SENTRY_DSN;
