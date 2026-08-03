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
 * `TracksService` phân biệt ba kết quả rất khác nhau cho cùng một hành động, và
 * sự khác nhau đó là **có chủ đích**: 403 nghĩa là "có tồn tại nhưng bạn không
 * được phép", 404 nghĩa là "với bạn thì nó không tồn tại". Nhầm 404 thành 403 là
 * rò rỉ thông tin (xác nhận id đó có thật ở quán/tổ chức khác).
 */
describe('Track scoping (integration)', () => {
  let ctx: IntegrationApp;
  let orgA: string;
  let orgB: string;
  let orgAdminA: JwtPayload;
  let store1Admin: JwtPayload;

  beforeAll(async () => {
    ctx = await createIntegrationApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);
    jest.clearAllMocks();

    const a = await createTenant(ctx.prisma, {
      slug: 'org-a',
      storeIds: ['a-store-1', 'a-store-2'],
    });
    const b = await createTenant(ctx.prisma, {
      slug: 'org-b',
      storeIds: ['b-store-1'],
    });
    orgA = a.orgId;
    orgB = b.orgId;

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
  });

  const api = () => request(ctx.app.getHttpServer());

  describe('DELETE /tracks/:id — the three-outcome matrix for a store admin', () => {
    it('deletes their own store track (200, row gone)', async () => {
      const track = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-1',
      });

      ctx.setUser(store1Admin);
      await api().delete(`/api/v1/tracks/${track.id}`).expect(200);

      expect(
        await ctx.prisma.track.findUnique({ where: { id: track.id } }),
      ).toBeNull();
      expect(ctx.s3.deleteFile).toHaveBeenCalledTimes(1);
    });

    it('refuses a shared chain track with 403 and keeps the row', async () => {
      // storeId = null → kho chung của chuỗi. Store admin THẤY nó (dùng để phát)
      // nhưng xoá là mất nhạc của mọi quán.
      const shared = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: null,
      });

      ctx.setUser(store1Admin);
      await api().delete(`/api/v1/tracks/${shared.id}`).expect(403);

      expect(
        await ctx.prisma.track.findUnique({ where: { id: shared.id } }),
      ).not.toBeNull();
      // Quan trọng: không được xoá file trên S3 trước rồi mới phát hiện không đủ quyền.
      expect(ctx.s3.deleteFile).not.toHaveBeenCalled();
    });

    it('returns 404 (not 403) for another store track in the same org', async () => {
      const other = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-2',
      });

      ctx.setUser(store1Admin);
      await api().delete(`/api/v1/tracks/${other.id}`).expect(404);

      expect(
        await ctx.prisma.track.findUnique({ where: { id: other.id } }),
      ).not.toBeNull();
    });

    it('returns 404 for a track in another organization', async () => {
      const foreign = await createTrack(ctx.prisma, { organizationId: orgB });

      ctx.setUser(store1Admin);
      await api().delete(`/api/v1/tracks/${foreign.id}`).expect(404);
    });
  });

  describe('DELETE /tracks/:id — org admin', () => {
    it('may delete any track in their organization, including another store', async () => {
      const other = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-2',
      });

      ctx.setUser(orgAdminA);
      await api().delete(`/api/v1/tracks/${other.id}`).expect(200);
    });

    it('still cannot touch another organization', async () => {
      const foreign = await createTrack(ctx.prisma, { organizationId: orgB });

      ctx.setUser(orgAdminA);
      await api().delete(`/api/v1/tracks/${foreign.id}`).expect(404);
    });
  });

  /**
   * Cascade là hành vi của DATABASE (`onDelete: Cascade` trên `PlaylistTrack`),
   * không phải của code — mock Prisma không thể chứng minh nó xảy ra.
   */
  describe('cascade to PlaylistTrack', () => {
    it('removes playlist entries when the track itself is deleted', async () => {
      const track = await createTrack(ctx.prisma, { organizationId: orgA });
      const playlist = await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'ORG',
      });
      await addTrackToPlaylist(ctx.prisma, playlist.id, track.id, 0);

      expect(await ctx.prisma.playlistTrack.count()).toBe(1);

      ctx.setUser(orgAdminA);
      await api().delete(`/api/v1/tracks/${track.id}`).expect(200);

      expect(await ctx.prisma.playlistTrack.count()).toBe(0);
      // Playlist vẫn còn — chỉ mục bài trong đó biến mất.
      expect(
        await ctx.prisma.playlist.findUnique({ where: { id: playlist.id } }),
      ).not.toBeNull();
    });
  });

  describe('GET /tracks — library visibility', () => {
    it('shows a store admin shared tracks plus their own, never another store', async () => {
      await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: null,
        title: 'Chung của chuỗi',
      });
      await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-1',
        title: 'Của quán 1',
      });
      await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-2',
        title: 'Của quán 2',
      });
      await createTrack(ctx.prisma, {
        organizationId: orgB,
        title: 'Của org B',
      });

      ctx.setUser(store1Admin);
      const res = await api().get('/api/v1/tracks').expect(200);

      const titles = (res.body.data as { title: string }[]).map((t) => t.title);
      expect(titles.sort()).toEqual(['Chung của chuỗi', 'Của quán 1']);
      expect(res.body.meta.total).toBe(2);
    });
  });

  describe('PATCH /tracks/:id', () => {
    it('applies the same 403/404 split as delete', async () => {
      const shared = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: null,
      });
      const other = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-2',
      });

      ctx.setUser(store1Admin);
      await api()
        .patch(`/api/v1/tracks/${shared.id}`)
        .send({ title: 'Đổi tên' })
        .expect(403);
      await api()
        .patch(`/api/v1/tracks/${other.id}`)
        .send({ title: 'Đổi tên' })
        .expect(404);
    });

    it('clears the artist when given null', async () => {
      const track = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-1',
      });
      await ctx.prisma.track.update({
        where: { id: track.id },
        data: { artist: 'Ca sĩ cũ' },
      });

      ctx.setUser(store1Admin);
      const res = await api()
        .patch(`/api/v1/tracks/${track.id}`)
        .send({ artist: null })
        .expect(200);

      expect(res.body.artist).toBeNull();
    });

    it('rejects an empty title with 400 before touching the database', async () => {
      const track = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-1',
        title: 'Nguyên bản',
      });

      ctx.setUser(store1Admin);
      await api()
        .patch(`/api/v1/tracks/${track.id}`)
        .send({ title: '' })
        .expect(400);

      const after = await ctx.prisma.track.findUnique({
        where: { id: track.id },
      });
      expect(after?.title).toBe('Nguyên bản');
    });
  });

  describe('GET /tracks/:id/stream-url', () => {
    it('refuses to presign a track the caller cannot see', async () => {
      const other = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-2',
      });

      ctx.setUser(store1Admin);
      await api().get(`/api/v1/tracks/${other.id}/stream-url`).expect(404);
      expect(ctx.s3.getPresignedUrl).not.toHaveBeenCalled();
    });

    it('returns 404 when the row exists but has no file', async () => {
      const track = await createTrack(ctx.prisma, {
        organizationId: orgA,
        storeId: 'a-store-1',
        s3Key: null,
      });

      ctx.setUser(store1Admin);
      await api().get(`/api/v1/tracks/${track.id}/stream-url`).expect(404);
    });
  });
});
