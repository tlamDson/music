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
 * `SyncService.assertStoreAccess` là cửa duy nhất vào mọi lệnh điều khiển loa
 * quán. Nó phân biệt 404 (quán không thuộc tổ chức của bạn — coi như không tồn
 * tại) với 403 (cùng tổ chức nhưng không phải quán bạn quản lý). Nhầm hai cái
 * này là lộ ra chuỗi có bao nhiêu quán và id của chúng.
 */
describe('Sync store access control (integration)', () => {
  let ctx: IntegrationApp;
  let orgA: string;
  let orgB: string;
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

    const playlist = await createPlaylist(ctx.prisma, {
      organizationId: orgA,
      scope: 'ORG',
    });
    const track = await createTrack(ctx.prisma, {
      organizationId: orgA,
      durationMs: 180_000,
    });
    await addTrackToPlaylist(ctx.prisma, playlist.id, track.id, 0);
    playlistId = playlist.id;
  });

  const api = () => request(ctx.app.getHttpServer());

  describe('the 404 / 403 / 200 matrix', () => {
    it('returns 404 for a store in another organization', async () => {
      ctx.setUser(store1Admin);
      await api()
        .post('/api/v1/sync/stores/b-store-1/play')
        .send({ playlistId })
        .expect(404);
    });

    it('returns 404 for an org admin reaching into another organization', async () => {
      ctx.setUser(orgAdminA);
      await api()
        .post('/api/v1/sync/stores/b-store-1/play')
        .send({ playlistId })
        .expect(404);
    });

    it('returns 403 for another store in the SAME organization', async () => {
      ctx.setUser(store1Admin);
      await api()
        .post('/api/v1/sync/stores/a-store-2/play')
        .send({ playlistId })
        .expect(403);
    });

    it('returns 201 for a store admin controlling their own store', async () => {
      ctx.setUser(store1Admin);
      await api()
        .post('/api/v1/sync/stores/a-store-1/play')
        .send({ playlistId })
        .expect(201);
    });

    it('lets an org admin control any store inside their organization', async () => {
      ctx.setUser(orgAdminA);
      await api()
        .post('/api/v1/sync/stores/a-store-2/play')
        .send({ playlistId })
        .expect(201);
    });
  });

  describe('every control route goes through the same gate', () => {
    it.each([
      ['post', 'pause'],
      ['post', 'resume'],
      ['post', 'next'],
      ['post', 'previous'],
      ['post', 'stop'],
    ])(
      '%s /sync/stores/:id/%s refuses another store with 403',
      async (_method, action) => {
        ctx.setUser(store1Admin);
        await api().post(`/api/v1/sync/stores/a-store-2/${action}`).expect(403);
      },
    );

    it('PATCH playback-mode refuses another store with 403', async () => {
      ctx.setUser(store1Admin);
      await api()
        .patch('/api/v1/sync/stores/a-store-2/playback-mode')
        .send({ repeat: 'ALL' })
        .expect(403);
    });

    it('GET now-playing refuses another store with 403', async () => {
      ctx.setUser(store1Admin);
      await api().get('/api/v1/sync/stores/a-store-2/now-playing').expect(403);
    });
  });

  describe('overview is org-admin only and org-scoped', () => {
    it('rejects a store admin with 403 (RolesGuard)', async () => {
      ctx.setUser(store1Admin);
      await api().get('/api/v1/sync/overview').expect(403);
    });

    it('lists only the stores of the caller organization', async () => {
      ctx.setUser(orgAdminA);
      const res = await api().get('/api/v1/sync/overview').expect(200);

      const ids = (res.body.data as { storeId: string }[]).map(
        (row) => row.storeId,
      );
      expect(ids).toEqual(expect.arrayContaining(['a-store-1', 'a-store-2']));
      expect(ids).not.toContain('b-store-1');
    });
  });

  describe('playing writes real state', () => {
    /**
     * `playStore` ghi `Store.startedAtTs` kiểu **BigInt**. Nếu app không gọi
     * `installBigIntJsonSupport()` thì mọi response chứa bản ghi Store ném
     * "Do not know how to serialize a BigInt" — main.ts gọi ở module scope nên
     * production luôn có, test thì phải tự lo (helpers/app.ts).
     */
    it('persists PLAYING status and a BigInt timestamp that serializes', async () => {
      ctx.setUser(store1Admin);
      await api()
        .post('/api/v1/sync/stores/a-store-1/play')
        .send({ playlistId })
        .expect(201);

      const store = await ctx.prisma.store.findUnique({
        where: { id: 'a-store-1' },
      });
      expect(store?.status).toBe('PLAYING');
      expect(typeof store?.startedAtTs).toBe('bigint');

      // Đọc lại qua HTTP: đây mới là chỗ BigInt phải serialize được.
      const res = await api().get('/api/v1/stores/a-store-1').expect(200);
      expect(res.body.id).toBe('a-store-1');
    });

    it('broadcasts to the store room exactly once', async () => {
      ctx.setUser(store1Admin);
      await api()
        .post('/api/v1/sync/stores/a-store-1/play')
        .send({ playlistId })
        .expect(201);

      expect(ctx.gateway.broadcastToStore).toHaveBeenCalledWith(
        'a-store-1',
        'store-now-playing',
        expect.objectContaining({ storeId: 'a-store-1' }),
      );
    });

    it('does not start a store when the playlist belongs to another org', async () => {
      const foreignPlaylist = await createPlaylist(ctx.prisma, {
        organizationId: orgB,
        scope: 'ORG',
      });

      ctx.setUser(store1Admin);
      await api()
        .post('/api/v1/sync/stores/a-store-1/play')
        .send({ playlistId: foreignPlaylist.id })
        .expect(404);

      const store = await ctx.prisma.store.findUnique({
        where: { id: 'a-store-1' },
      });
      expect(store?.status).toBe('STOPPED');
    });

    it('refuses to play an empty playlist', async () => {
      const empty = await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'ORG',
        name: 'Rỗng',
      });

      ctx.setUser(store1Admin);
      await api()
        .post('/api/v1/sync/stores/a-store-1/play')
        .send({ playlistId: empty.id })
        .expect(404);
    });

    it('rejects a missing playlistId with 400 from the Zod pipe', async () => {
      ctx.setUser(store1Admin);
      const res = await api()
        .post('/api/v1/sync/stores/a-store-1/play')
        .send({})
        .expect(400);

      expect(res.body.errors).toHaveProperty('playlistId');
    });
  });
});
