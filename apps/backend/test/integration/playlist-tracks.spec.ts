import request from 'supertest';
import { JwtPayload } from '@cafe-music/shared';
import { createIntegrationApp, IntegrationApp } from './helpers/app';
import {
  addTrackToPlaylist,
  createPlaylist,
  createTenant,
  createTrack,
  jwtPayloadFor,
  truncateAll,
} from './helpers/db';

/**
 * Bảng `PlaylistTrack` có `@@unique([playlistId, position])`. Ràng buộc đó được
 * Postgres kiểm **theo từng câu lệnh**, không hoãn tới cuối transaction — nên
 * cách sắp xếp lại của service (ghi vị trí âm rồi mới ghi vị trí thật) chỉ có
 * thể chứng minh bằng DB thật. Mock Prisma không có unique constraint nào cả.
 */
describe('Playlist tracks against real Postgres (integration)', () => {
  let ctx: IntegrationApp;
  let orgA: string;
  let orgAdminA: JwtPayload;
  let store1Admin: JwtPayload;
  let playlistId: string;

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);

    const a = await createTenant(ctx.prisma, {
      slug: 'org-a',
      storeIds: ['a-store-1', 'a-store-2'],
    });
    orgA = a.orgId;

    orgAdminA = jwtPayloadFor({
      email: 'admin-a@test.com',
      role: 'ORG_ADMIN',
      organizationId: orgA,
    });
    store1Admin = jwtPayloadFor({
      email: 'store1@test.com',
      role: 'STORE_ADMIN',
      organizationId: orgA,
      storeId: 'a-store-1',
    });

    const playlist = await createPlaylist(ctx.prisma, {
      organizationId: orgA,
      scope: 'ORG',
    });
    playlistId = playlist.id;
  });

  const api = () => request(ctx.app.getHttpServer());

  async function positions(): Promise<{ trackId: string; position: number }[]> {
    return ctx.prisma.playlistTrack.findMany({
      where: { playlistId },
      orderBy: { position: 'asc' },
      select: { trackId: true, position: true },
    });
  }

  describe('reorderTracks — the two-phase write', () => {
    it('reverses the order without violating the unique constraint', async () => {
      const t1 = await createTrack(ctx.prisma, {
        organizationId: orgA,
        title: 'A',
      });
      const t2 = await createTrack(ctx.prisma, {
        organizationId: orgA,
        title: 'B',
      });
      const t3 = await createTrack(ctx.prisma, {
        organizationId: orgA,
        title: 'C',
      });
      await addTrackToPlaylist(ctx.prisma, playlistId, t1.id, 0);
      await addTrackToPlaylist(ctx.prisma, playlistId, t2.id, 1);
      await addTrackToPlaylist(ctx.prisma, playlistId, t3.id, 2);

      ctx.setUser(orgAdminA);
      // Đảo ngược hoàn toàn: mọi vị trí đều đổi, ghi thẳng là đụng unique ngay
      // bài đầu tiên.
      await api()
        .patch(`/api/v1/playlists/${playlistId}/tracks/reorder`)
        .send({ trackIds: [t3.id, t2.id, t1.id] })
        .expect(200);

      expect(await positions()).toEqual([
        { trackId: t3.id, position: 0 },
        { trackId: t2.id, position: 1 },
        { trackId: t1.id, position: 2 },
      ]);
    });

    it('swaps two adjacent tracks (the tightest collision case)', async () => {
      const t1 = await createTrack(ctx.prisma, { organizationId: orgA });
      const t2 = await createTrack(ctx.prisma, { organizationId: orgA });
      await addTrackToPlaylist(ctx.prisma, playlistId, t1.id, 0);
      await addTrackToPlaylist(ctx.prisma, playlistId, t2.id, 1);

      ctx.setUser(orgAdminA);
      await api()
        .patch(`/api/v1/playlists/${playlistId}/tracks/reorder`)
        .send({ trackIds: [t2.id, t1.id] })
        .expect(200);

      expect(await positions()).toEqual([
        { trackId: t2.id, position: 0 },
        { trackId: t1.id, position: 1 },
      ]);
    });

    it('leaves no negative position behind after the transaction', async () => {
      const t1 = await createTrack(ctx.prisma, { organizationId: orgA });
      const t2 = await createTrack(ctx.prisma, { organizationId: orgA });
      await addTrackToPlaylist(ctx.prisma, playlistId, t1.id, 0);
      await addTrackToPlaylist(ctx.prisma, playlistId, t2.id, 1);

      ctx.setUser(orgAdminA);
      await api()
        .patch(`/api/v1/playlists/${playlistId}/tracks/reorder`)
        .send({ trackIds: [t2.id, t1.id] })
        .expect(200);

      const rows = await positions();
      expect(rows.every((row) => row.position >= 0)).toBe(true);
    });
  });

  describe('addTrack — position after a hole in the middle', () => {
    /**
     * Xoá một bài giữa playlist để lại lỗ hổng vị trí. Nếu tính position bằng
     * "đếm số bài" thì bài mới nhận đúng vị trí của bài cuối đang có → vi phạm
     * unique. Service lấy `max(position) + 1` chính vì thế.
     */
    it('appends after the highest position, not after the count', async () => {
      const t1 = await createTrack(ctx.prisma, { organizationId: orgA });
      const t2 = await createTrack(ctx.prisma, { organizationId: orgA });
      const t3 = await createTrack(ctx.prisma, { organizationId: orgA });
      await addTrackToPlaylist(ctx.prisma, playlistId, t1.id, 0);
      await addTrackToPlaylist(ctx.prisma, playlistId, t2.id, 1);
      await addTrackToPlaylist(ctx.prisma, playlistId, t3.id, 2);

      // Xoá bài giữa → còn position 0 và 2, count = 2 nhưng max = 2.
      ctx.setUser(orgAdminA);
      await api()
        .delete(`/api/v1/playlists/${playlistId}/tracks/${t2.id}`)
        .expect(200);

      const t4 = await createTrack(ctx.prisma, { organizationId: orgA });
      const res = await api()
        .post(`/api/v1/playlists/${playlistId}/tracks`)
        .send({ trackId: t4.id })
        .expect(201);

      expect(res.body.position).toBe(3);
      expect(await positions()).toHaveLength(3);
    });

    it('starts at position 0 on an empty playlist', async () => {
      const track = await createTrack(ctx.prisma, { organizationId: orgA });

      ctx.setUser(orgAdminA);
      const res = await api()
        .post(`/api/v1/playlists/${playlistId}/tracks`)
        .send({ trackId: track.id })
        .expect(201);

      expect(res.body.position).toBe(0);
    });
  });

  describe('addTrack — cross-store track cannot be smuggled in', () => {
    it('refuses a track that belongs to another store', async () => {
      const foreignTrack = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-2',
      });

      ctx.setUser(store1Admin);
      await api()
        .post(`/api/v1/playlists/${playlistId}/tracks`)
        .send({ trackId: foreignTrack.id })
        .expect(404);

      expect(await positions()).toHaveLength(0);
    });

    it('accepts a shared chain track', async () => {
      const shared = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: null,
      });

      ctx.setUser(store1Admin);
      await api()
        .post(`/api/v1/playlists/${playlistId}/tracks`)
        .send({ trackId: shared.id })
        .expect(201);
    });

    it('refuses a track from another organization', async () => {
      const other = await createTenant(ctx.prisma, {
        slug: 'org-b',
        storeIds: ['b-store-1'],
      });
      const foreign = await createTrack(ctx.prisma, {
        organizationId: other.orgId,
      });

      ctx.setUser(orgAdminA);
      await api()
        .post(`/api/v1/playlists/${playlistId}/tracks`)
        .send({ trackId: foreign.id })
        .expect(404);
    });
  });

  describe('GET /playlists/:id returns tracks in position order', () => {
    it('orders by position, not by insertion or id', async () => {
      const t1 = await createTrack(ctx.prisma, {
        organizationId: orgA,
        title: 'Đầu',
      });
      const t2 = await createTrack(ctx.prisma, {
        organizationId: orgA,
        title: 'Giữa',
      });
      const t3 = await createTrack(ctx.prisma, {
        organizationId: orgA,
        title: 'Cuối',
      });
      // Chèn lộn xộn để thứ tự chèn khác thứ tự position.
      await addTrackToPlaylist(ctx.prisma, playlistId, t3.id, 2);
      await addTrackToPlaylist(ctx.prisma, playlistId, t1.id, 0);
      await addTrackToPlaylist(ctx.prisma, playlistId, t2.id, 1);

      ctx.setUser(orgAdminA);
      const res = await api()
        .get(`/api/v1/playlists/${playlistId}`)
        .expect(200);

      const titles = (
        res.body.playlistTracks as { track: { title: string } }[]
      ).map((entry) => entry.track.title);
      expect(titles).toEqual(['Đầu', 'Giữa', 'Cuối']);
    });
  });

  describe('totalDurationMs in the list response', () => {
    it('sums real durations from the joined tracks', async () => {
      const t1 = await createTrack(ctx.prisma, {
        organizationId: orgA,
        durationMs: 120_000,
      });
      const t2 = await createTrack(ctx.prisma, {
        organizationId: orgA,
        durationMs: 180_000,
      });
      await addTrackToPlaylist(ctx.prisma, playlistId, t1.id, 0);
      await addTrackToPlaylist(ctx.prisma, playlistId, t2.id, 1);

      ctx.setUser(orgAdminA);
      const res = await api().get('/api/v1/playlists').expect(200);

      const found = (
        res.body.data as { id: string; totalDurationMs: number }[]
      ).find((p) => p.id === playlistId);
      expect(found?.totalDurationMs).toBe(300_000);
    });
  });

  describe('removeTrack', () => {
    it('is idempotent when the track is not in the playlist', async () => {
      const track = await createTrack(ctx.prisma, { organizationId: orgA });

      ctx.setUser(orgAdminA);
      await api()
        .delete(`/api/v1/playlists/${playlistId}/tracks/${track.id}`)
        .expect(200);
    });
  });
});
