import { execSync } from 'child_process';

export default function globalSetup() {
  // Chạy migrations trên test DB trước khi chạy integration tests
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5433/cafe_music_test';

  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env },
      stdio: 'inherit',
    });
  } catch {
    console.error(
      'Migration failed - make sure postgres_test container is running',
    );
    process.exit(1);
  }
}
