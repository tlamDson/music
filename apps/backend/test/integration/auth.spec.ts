import request from 'supertest';
import { createIntegrationApp, IntegrationApp } from './helpers/app';
import {
  createTenant,
  createUser,
  hashTestPassword,
  TEST_PASSWORD,
  truncateAll,
} from './helpers/db';

/**
 * Suite DUY NHẤT chạy với `JwtAuthGuard` THẬT: đăng nhập bằng user bcrypt có
 * thật trong DB, lấy JWT thật, rồi gọi route bằng Bearer token đó.
 *
 * Vì sao cần tầng này: `JwtStrategy.validate()` trả về **bản ghi Prisma `User`**
 * chứ không phải payload JWT, dù `@CurrentUser()` khai kiểu `JwtPayload`. Mock
 * không phân biệt được hai shape đó nên không unit test nào phát hiện — bug
 * `where: { id: undefined }` từng lọt tới lúc build `/me` đúng vì thế.
 */
describe('Auth end to end (integration)', () => {
  let ctx: IntegrationApp;
  let orgId: string;

  beforeAll(async () => {
    ctx = await createIntegrationApp({ realAuth: true });
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await truncateAll(ctx.prisma);

    const tenant = await createTenant(ctx.prisma, {
      slug: 'org-a',
      storeIds: ['a-store-1'],
    });
    orgId = tenant.orgId;

    const passwordHash = await hashTestPassword();
    await createUser(ctx.prisma, {
      email: 'admin@test.com',
      role: 'ORG_ADMIN',
      organizationId: orgId,
      passwordHash,
    });
    await createUser(ctx.prisma, {
      email: 'store1@test.com',
      role: 'STORE_ADMIN',
      organizationId: orgId,
      storeId: 'a-store-1',
      passwordHash,
    });
  });

  const api = () => request(ctx.app.getHttpServer());

  async function login(
    email: string,
    password = TEST_PASSWORD,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body;
  }

  describe('POST /auth/login', () => {
    it('returns both tokens with 200 (not 201)', async () => {
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: TEST_PASSWORD })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toEqual(expect.any(String));
      // Không bao giờ trả kèm hồ sơ/hash trong response đăng nhập.
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('user');
    });

    it('rejects a wrong password with 401', async () => {
      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: 'sai-mat-khau' })
        .expect(401);
    });

    /**
     * Cùng một câu trả lời cho "email không tồn tại" và "mật khẩu sai" — khác
     * nhau là kẻ tấn công dò được email nào có trong hệ thống.
     */
    it('gives the same answer for an unknown email as for a wrong password', async () => {
      const unknown = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'khong-ton-tai@test.com', password: TEST_PASSWORD })
        .expect(401);
      const wrongPassword = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: 'sai-mat-khau' })
        .expect(401);

      expect(unknown.body.message).toBe(wrongPassword.body.message);
    });

    it('rejects a deactivated account', async () => {
      await ctx.prisma.user.update({
        where: { email: 'admin@test.com' },
        data: { isActive: false },
      });

      await api()
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: TEST_PASSWORD })
        .expect(401);
    });

    it('rejects a malformed body with 400 before hitting the database', async () => {
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'khong-phai-email', password: 'x' })
        .expect(400);

      expect(res.body.message).toBe('Validation failed');
      expect(res.body.errors).toHaveProperty('email');
      expect(res.body.errors).toHaveProperty('password');
    });
  });

  describe('using a real token', () => {
    it('resolves the current user through JwtStrategy and returns a profile', async () => {
      const { accessToken } = await login('admin@test.com');

      const res = await api()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.email).toBe('admin@test.com');
      expect(res.body.role).toBe('ORG_ADMIN');
      // Không bao giờ rò hash ra ngoài, kể cả trên route hồ sơ của chính mình.
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('rejects a request with no token', async () => {
      await api().get('/api/v1/me').expect(401);
    });

    it('rejects a garbage token', async () => {
      await api()
        .get('/api/v1/me')
        .set('Authorization', 'Bearer khong-phai-jwt')
        .expect(401);
    });

    it('carries the role into RolesGuard (store admin blocked from an org-admin route)', async () => {
      const { accessToken } = await login('store1@test.com');

      await api()
        .get('/api/v1/sync/overview')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('scopes data by the organization embedded in the token', async () => {
      const other = await createTenant(ctx.prisma, {
        slug: 'org-b',
        storeIds: ['b-store-1'],
      });
      await ctx.prisma.playlist.create({
        data: {
          name: 'Của org B',
          scope: 'ORG',
          organizationId: other.orgId,
        },
      });

      const { accessToken } = await login('admin@test.com');
      const res = await api()
        .get('/api/v1/playlists')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });
  });

  /**
   * ĐIỂM QUAN TRỌNG NHẤT của suite này.
   *
   * `AuthService.validateJwtPayload` chạy ở MỌI request có JWT và kiểm
   * `isActive` ở đó — nên access token còn hạn của tài khoản vừa bị vô hiệu hoá
   * bị từ chối ngay request kế tiếp, không cần token blocklist.
   *
   * Chỉ tầng này chứng minh được: cần JWT thật (còn hạn) + DB thật (đổi cờ giữa
   * chừng). Unit test mock `validateJwtPayload` nên nó luôn trả về user hợp lệ.
   */
  describe('deactivating an account invalidates a token that is still valid', () => {
    it('accepts the token, then rejects it after isActive flips to false', async () => {
      const { accessToken } = await login('admin@test.com');

      await api()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await ctx.prisma.user.update({
        where: { email: 'admin@test.com' },
        data: { isActive: false },
      });

      // Cùng token đó, không hết hạn, không đăng xuất — vẫn phải bị chặn.
      await api()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });

    it('also refuses to refresh with a token from a deactivated account', async () => {
      const { refreshToken } = await login('admin@test.com');

      await ctx.prisma.user.update({
        where: { email: 'admin@test.com' },
        data: { isActive: false },
      });

      await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('rejects a token whose user row was deleted entirely', async () => {
      const { accessToken } = await login('store1@test.com');

      await ctx.prisma.user.delete({ where: { email: 'store1@test.com' } });

      await api()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('issues a working access token from a refresh token', async () => {
      const { refreshToken } = await login('admin@test.com');

      const res = await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.accessToken).toEqual(expect.any(String));

      await api()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
    });

    it('refuses an access token used in place of a refresh token', async () => {
      const { accessToken } = await login('admin@test.com');

      // Hai secret khác nhau — dùng nhầm loại token phải hỏng.
      await api()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: accessToken })
        .expect(401);
    });
  });

  describe('PATCH /me', () => {
    it('updates the name and persists it', async () => {
      const { accessToken } = await login('admin@test.com');

      await api()
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Tên mới' })
        .expect(200);

      const row = await ctx.prisma.user.findUnique({
        where: { email: 'admin@test.com' },
      });
      expect(row?.name).toBe('Tên mới');
    });

    /**
     * `UpdateProfileSchema` chỉ có `name`, và Zod **strip** field lạ thay vì
     * reject — nên request dưới đây trả 200 nhưng KHÔNG được nâng quyền.
     */
    it('silently drops privilege fields instead of escalating', async () => {
      const { accessToken } = await login('store1@test.com');

      await api()
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Vẫn là store admin', role: 'ORG_ADMIN', isActive: true })
        .expect(200);

      const row = await ctx.prisma.user.findUnique({
        where: { email: 'store1@test.com' },
      });
      expect(row?.role).toBe('STORE_ADMIN');
      expect(row?.storeId).toBe('a-store-1');
    });
  });
});
