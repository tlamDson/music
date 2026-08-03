import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtPayload } from '@cafe-music/shared';
import { MeController } from '../../src/modules/users/me.controller';
import { UsersController } from '../../src/modules/users/users.controller';
import { UsersService } from '../../src/modules/users/users.service';
import { JwtAuthGuard } from '../../src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';

/**
 * `UsersController` (`/users`) chỉ ORG_ADMIN gọi được (`@Roles('ORG_ADMIN')` ở
 * cấp class) và đã có `@Patch(':id')` — thêm route tự phục vụ vào đó sẽ vướng
 * cả hai. `/me` là controller/prefix riêng để STORE_ADMIN cũng gọi được và
 * không đụng `:id`. Dựng app thật (guard giả) để bắt đúng lớp routing/RBAC,
 * thứ unit test gọi thẳng method controller không thấy được — cùng khuôn với
 * `folders.controller.spec.ts`.
 */
describe('MeController (routing)', () => {
  let app: INestApplication;
  let currentUser: JwtPayload;

  const usersService = {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  class StubJwtAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<{ user: JwtPayload }>();
      req.user = currentUser;
      return true;
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MeController, UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(StubJwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser = {
      sub: 'user-2',
      email: 'store1@cafe.com',
      role: 'STORE_ADMIN',
      organizationId: 'org-1',
      storeId: 'store-1',
    };
  });

  it('lets any authenticated role read its own profile', async () => {
    usersService.getProfile.mockResolvedValue({
      id: 'user-2',
      email: 'store1@cafe.com',
      name: 'Store Admin',
      role: 'STORE_ADMIN',
      storeId: 'store-1',
      isActive: true,
      createdAt: new Date().toISOString(),
      store: { name: 'Store 1' },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .expect(200);

    expect(res.body).not.toHaveProperty('passwordHash');
    expect(usersService.getProfile).toHaveBeenCalledWith(currentUser);
  });

  it('lets a store admin (blocked from /users by RolesGuard) update their own name', async () => {
    usersService.updateProfile.mockResolvedValue({
      id: 'user-2',
      name: 'Tên mới',
    });

    await request(app.getHttpServer())
      .patch('/api/v1/me')
      .send({ name: 'Tên mới' })
      .expect(200);

    expect(usersService.updateProfile).toHaveBeenCalledWith(currentUser, {
      name: 'Tên mới',
    });
  });

  it('rejects a name that is empty after validation', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me')
      .send({ name: '' })
      .expect(400);

    expect(usersService.updateProfile).not.toHaveBeenCalled();
  });

  it('routes password changes to /me/password without colliding with /me', async () => {
    usersService.changePassword.mockResolvedValue({
      message: 'Password updated',
    });

    await request(app.getHttpServer())
      .patch('/api/v1/me/password')
      .send({
        currentPassword: 'old-password',
        newPassword: 'new-password-123',
      })
      .expect(200);

    expect(usersService.changePassword).toHaveBeenCalledWith(currentUser, {
      currentPassword: 'old-password',
      newPassword: 'new-password-123',
    });
  });

  it('still resolves ORG_ADMIN-only /users routes unaffected by /me', async () => {
    usersService.findAll.mockResolvedValue({ data: [] });

    await request(app.getHttpServer()).get('/api/v1/users').expect(200);

    expect(usersService.findAll).toHaveBeenCalledWith(currentUser);
    expect(usersService.getProfile).not.toHaveBeenCalled();
  });
});
