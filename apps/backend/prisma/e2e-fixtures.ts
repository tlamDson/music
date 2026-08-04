import { PrismaClient } from '@prisma/client';

/**
 * Fixture cho Playwright e2e — chạy SAU `prisma:seed` (cần org demo có sẵn).
 *
 * Vì sao cần: seed chỉ tạo org + user + quán, KHÔNG có playlist/track nào —
 * `/store` sẽ render "Chưa có playlist nào" và e2e không có gì để điều hướng
 * vào. Idempotent như seed: chạy lại không nhân đôi dữ liệu.
 *
 * Track cố tình mang s3Key giả: e2e hiện chỉ kiểm login + điều hướng, không
 * assert nhạc phát thật (xem ghi chú trong playwright.config.ts).
 */
const prisma = new PrismaClient();

const PLAYLIST_NAME = 'E2E Smoke Playlist';
const TRACK_TITLE = 'E2E Smoke Track';

async function main() {
  const org = await prisma.organization.findUnique({
    where: { slug: 'cafe-music-demo' },
  });
  if (!org) {
    throw new Error('Chưa có org demo — chạy prisma:seed trước e2e-fixtures.');
  }

  let track = await prisma.track.findFirst({
    where: { title: TRACK_TITLE, organizationId: org.id },
  });
  track ??= await prisma.track.create({
    data: {
      title: TRACK_TITLE,
      artist: 'E2E Artist',
      durationMs: 180_000,
      source: 'SELF_HOSTED',
      s3Key: `${org.id}/tracks/e2e-smoke.mp3`,
      organizationId: org.id,
      storeId: null,
    },
  });

  let playlist = await prisma.playlist.findFirst({
    where: { name: PLAYLIST_NAME, organizationId: org.id },
  });
  playlist ??= await prisma.playlist.create({
    data: { name: PLAYLIST_NAME, scope: 'ORG', organizationId: org.id },
  });

  const entry = await prisma.playlistTrack.findFirst({
    where: { playlistId: playlist.id, trackId: track.id },
  });
  if (!entry) {
    await prisma.playlistTrack.create({
      data: { playlistId: playlist.id, trackId: track.id, position: 0 },
    });
  }

  console.log(
    `E2E fixtures ready: playlist "${PLAYLIST_NAME}" (${playlist.id})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
