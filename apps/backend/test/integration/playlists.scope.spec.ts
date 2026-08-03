import request from 'supertest';
import { JwtPayload } from '@cafe-music/shared';
import { createIntegrationApp, IntegrationApp } from './helpers/app';
import {
  createPlaylist,
  createTenant,
  jwtPayloadFor,
  truncateAll,
} from './helpers/db';

/**
 * Phạm vi dữ liệu đa tổ chức chạy trên Postgres THẬT.
 *
 * Unit test không chứng minh được gì ở đây: `mockDeep<PrismaClient>()` trả về
 * đúng thứ ta bảo nó trả, nên một mệnh đề `where` thiếu `organizationId` vẫn
 * xanh mượt trong khi production để org A đọc dữ liệu của org B.
 */
describe('Playlist scoping (integration)', () => {
  let ctx: IntegrationApp;
  let orgAdminA: JwtPayload;
  let store1Admin: JwtPayload;
  let store2Admin: JwtPayload;
  let orgAdminB: JwtPayload;
  let orgA: string;
  let orgB: string;

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
      email: 'store1-a@test.com',
      role: 'STORE_ADMIN',
      organizationId: orgA,
      storeId: 'a-store-1',
    });
    store2Admin = jwtPayloadFor({
      email: 'store2-a@test.com',
      role: 'STORE_ADMIN',
      organizationId: orgA,
      storeId: 'a-store-2',
    });
    orgAdminB = jwtPayloadFor({
      email: 'admin-b@test.com',
      role: 'ORG_ADMIN',
      organizationId: orgB,
    });
  });

  const api = () => request(ctx.app.getHttpServer());

  describe('cross-organization isolation', () => {
    it('hides another org playlist from the list', async () => {
      await createPlaylist(ctx.prisma, {
        organizationId: orgB,
        scope: 'ORG',
        name: 'Của org B',
      });

      ctx.setUser(orgAdminA);
      const res = await api().get('/api/v1/playlists').expect(200);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.total).toBe(0);
    });

    it('returns 404 (not 403) when reading another org playlist directly', async () => {
      const foreign = await createPlaylist(ctx.prisma, {
        organizationId: orgB,
        scope: 'ORG',
      });

      ctx.setUser(orgAdminA);
      // 404 chứ không phải 403: không được lộ ra là id đó có tồn tại.
      await api().get(`/api/v1/playlists/${foreign.id}`).expect(404);
    });

    it('refuses to update or delete another org playlist', async () => {
      const foreign = await createPlaylist(ctx.prisma, {
        organizationId: orgB,
        scope: 'ORG',
        name: 'Nguyên bản',
      });

      ctx.setUser(orgAdminA);
      await api()
        .patch(`/api/v1/playlists/${foreign.id}`)
        .send({ name: 'Đã bị đổi' })
        .expect(404);
      await api().delete(`/api/v1/playlists/${foreign.id}`).expect(404);

      const after = await ctx.prisma.playlist.findUnique({
        where: { id: foreign.id },
      });
      expect(after?.name).toBe('Nguyên bản');
    });
  });

  describe('store-level filtering in the list', () => {
    it('shows a store admin only ORG playlists and their own store playlists', async () => {
      await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'ORG',
        name: 'Của chuỗi',
      });
      await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'STORE',
        storeId: 'a-store-1',
        name: 'Của quán 1',
      });
      await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'STORE',
        storeId: 'a-store-2',
        name: 'Của quán 2',
      });

      ctx.setUser(store1Admin);
      const res = await api().get('/api/v1/playlists').expect(200);

      const names = (res.body.data as { name: string }[]).map((p) => p.name);
      expect(names).toEqual(
        expect.arrayContaining(['Của chuỗi', 'Của quán 1']),
      );
      expect(names).not.toContain('Của quán 2');
    });

    it('shows an org admin every playlist in the organization', async () => {
      await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'STORE',
        storeId: 'a-store-1',
      });
      await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'STORE',
        storeId: 'a-store-2',
      });

      ctx.setUser(orgAdminA);
      const res = await api().get('/api/v1/playlists').expect(200);

      expect(res.body.data).toHaveLength(2);
    });
  });

  /**
   * ĐÂY LÀ PHÁT HIỆN CHÍNH của suite này.
   *
   * `findAll` lọc theo quán cho STORE_ADMIN, nhưng `findOne`/`update`/`remove`
   * chỉ lọc `organizationId`. Hệ quả: playlist của quán 2 bị ẨN khỏi danh sách
   * của admin quán 1, nhưng admin quán 1 vẫn ĐỌC, ĐỔI TÊN và XOÁ được nó nếu
   * biết id — mà id thì nằm ngay trên URL khi họ từng được chia sẻ link.
   *
   * Test dưới đây ghim ĐÚNG HÀNH VI HIỆN TẠI (không phải hành vi mong muốn) để
   * thay đổi trở thành quyết định có ý thức. Xem phần "Nợ đã biết" trong PR.
   */
  describe('KNOWN GAP: list filters by store but detail/mutation do not', () => {
    it('lets a store admin READ another store playlist by id', async () => {
      const other = await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'STORE',
        storeId: 'a-store-2',
        name: 'Của quán 2',
      });

      ctx.setUser(store1Admin);
      const res = await api().get(`/api/v1/playlists/${other.id}`).expect(200);

      expect(res.body.name).toBe('Của quán 2');
    });

    it('lets a store admin RENAME and DELETE another store playlist', async () => {
      const other = await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'STORE',
        storeId: 'a-store-2',
        name: 'Của quán 2',
      });

      ctx.setUser(store1Admin);
      await api()
        .patch(`/api/v1/playlists/${other.id}`)
        .send({ name: 'Bị quán 1 đổi' })
        .expect(200);

      const renamed = await ctx.prisma.playlist.findUnique({
        where: { id: other.id },
      });
      expect(renamed?.name).toBe('Bị quán 1 đổi');

      await api().delete(`/api/v1/playlists/${other.id}`).expect(200);
      expect(
        await ctx.prisma.playlist.findUnique({ where: { id: other.id } }),
      ).toBeNull();
    });

    it('still blocks a store admin from mutating an ORG playlist', async () => {
      const orgPlaylist = await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'ORG',
        name: 'Của chuỗi',
      });

      ctx.setUser(store2Admin);
      await api()
        .patch(`/api/v1/playlists/${orgPlaylist.id}`)
        .send({ name: 'Không được phép' })
        .expect(403);
      await api().delete(`/api/v1/playlists/${orgPlaylist.id}`).expect(403);
    });
  });

  describe('create', () => {
    it('rejects a store admin creating an ORG-scoped playlist', async () => {
      ctx.setUser(store1Admin);
      await api()
        .post('/api/v1/playlists')
        .send({ name: 'Thử', scope: 'ORG' })
        .expect(403);
    });

    it('rejects a store admin targeting another store explicitly', async () => {
      ctx.setUser(store1Admin);
      await api()
        .post('/api/v1/playlists')
        .send({ name: 'Thử', scope: 'STORE', storeId: 'a-store-2' })
        .expect(403);
    });

    it('defaults a store admin STORE playlist to their own store', async () => {
      ctx.setUser(store1Admin);
      const res = await api()
        .post('/api/v1/playlists')
        .send({ name: 'Của tôi', scope: 'STORE' })
        .expect(201);

      expect(res.body.storeId).toBe('a-store-1');
      expect(res.body.organizationId).toBe(orgA);
    });

    it('rejects an invalid scope with 400 from the Zod pipe', async () => {
      ctx.setUser(orgAdminA);
      const res = await api()
        .post('/api/v1/playlists')
        .send({ name: 'Thử', scope: 'GLOBAL' })
        .expect(400);

      expect(res.body.message).toBe('Validation failed');
      expect(res.body.errors).toHaveProperty('scope');
    });
  });

  /**
   * `mode: 'insensitive'` là ngữ nghĩa của Postgres (ILIKE). Prisma mock chấp
   * nhận mọi thứ nên unit test không chứng minh được tìm kiếm có phân biệt hoa
   * thường hay không — chỉ DB thật trả lời được.
   */
  describe('search (q) against real Postgres', () => {
    beforeEach(async () => {
      await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'ORG',
        name: 'Nhạc Chill Buổi Sáng',
      });
      await createPlaylist(ctx.prisma, {
        organizationId: orgA,
        scope: 'ORG',
        name: 'Acoustic',
      });
    });

    it('matches case-insensitively', async () => {
      ctx.setUser(orgAdminA);
      const res = await api().get('/api/v1/playlists?q=chill').expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Nhạc Chill Buổi Sáng');
    });

    it('matches a substring in the middle of the name', async () => {
      ctx.setUser(orgAdminA);
      const res = await api().get('/api/v1/playlists?q=BUOI').expect(200);

      // 'BUOI' (không dấu) KHÔNG khớp 'Buổi' — Postgres ILIKE không bỏ dấu.
      expect(res.body.data).toHaveLength(0);
    });

    it('rejects a whitespace-only q at the validation layer', async () => {
      ctx.setUser(orgAdminA);
      await api().get('/api/v1/playlists?q=%20%20%20').expect(400);
    });

    it('never leaks another org row through search', async () => {
      await createPlaylist(ctx.prisma, {
        organizationId: orgB,
        scope: 'ORG',
        name: 'Chill của org B',
      });

      ctx.setUser(orgAdminB);
      const res = await api().get('/api/v1/playlists?q=chill').expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Chill của org B');
    });
  });
});
