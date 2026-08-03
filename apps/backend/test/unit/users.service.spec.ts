import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { UsersService } from '../../src/modules/users/users.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisThrottlerStorage } from '../../src/common/throttler/redis-throttler.storage';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaClient>;
  let redisThrottler: jest.Mocked<RedisThrottlerStorage>;

  const orgAdminUser = {
    sub: 'user-1',
    email: 'admin@cafe.com',
    role: 'ORG_ADMIN' as const,
    organizationId: 'org-1',
    storeId: null,
  };

  const selectedUser = {
    id: 'user-2',
    email: 'staff@cafe.com',
    name: 'Staff',
    role: 'STORE_ADMIN' as const,
    storeId: 'store-1',
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();
    const redisThrottlerMock = {
      increment: jest.fn().mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    } as unknown as jest.Mocked<RedisThrottlerStorage>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisThrottlerStorage, useValue: redisThrottlerMock },
      ],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService);
    redisThrottler = module.get(RedisThrottlerStorage);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findAll', () => {
    it('should return users scoped to the organization without passwordHash', async () => {
      prisma.user.findMany.mockResolvedValue([selectedUser] as any);

      const result = await service.findAll(orgAdminUser);

      expect(result).toEqual({ data: [selectedUser] });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          storeId: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('create', () => {
    const createDto = {
      email: 'staff@cafe.com',
      password: 'password123',
      name: 'Staff',
      role: 'STORE_ADMIN' as const,
    };

    it('should throw ConflictException when email is already in use', async () => {
      prisma.user.findUnique.mockResolvedValue(selectedUser as any);

      await expect(service.create(createDto, orgAdminUser)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should hash the password and create the user in the caller organization', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(selectedUser as any);
      const hashSpy = jest
        .spyOn(require('bcrypt'), 'hash')
        .mockResolvedValue('hashed-pw' as never);

      const result = await service.create(createDto, orgAdminUser);

      expect(hashSpy).toHaveBeenCalledWith('password123', 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'staff@cafe.com',
          passwordHash: 'hashed-pw',
          name: 'Staff',
          role: 'STORE_ADMIN',
          organizationId: 'org-1',
          storeId: null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          storeId: true,
          isActive: true,
          createdAt: true,
        },
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should pass storeId through when provided', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(selectedUser as any);
      jest
        .spyOn(require('bcrypt'), 'hash')
        .mockResolvedValue('hashed-pw' as never);

      await service.create({ ...createDto, storeId: 'store-1' }, orgAdminUser);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storeId: 'store-1' }),
        }),
      );
    });
  });

  describe('update', () => {
    it('should throw NotFoundException when target user is outside the organization', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.update('user-x', { name: 'New Name' }, orgAdminUser),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should update name, role and storeId of a user in the organization', async () => {
      prisma.user.findFirst.mockResolvedValue(selectedUser as any);
      prisma.user.update.mockResolvedValue({
        ...selectedUser,
        name: 'New Name',
      } as any);

      const result = await service.update(
        'user-2',
        { name: 'New Name', role: 'ORG_ADMIN', storeId: null },
        orgAdminUser,
      );

      expect(result).toMatchObject({ name: 'New Name' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { name: 'New Name', role: 'ORG_ADMIN', storeId: null },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          storeId: true,
          isActive: true,
        },
      });
    });

    it('should allow setting isActive to false for a STORE_ADMIN without a store assigned', async () => {
      const unassignedStoreAdmin = {
        ...selectedUser,
        storeId: null,
      };
      prisma.user.findFirst.mockResolvedValue(unassignedStoreAdmin as any);
      prisma.user.update.mockResolvedValue({
        ...unassignedStoreAdmin,
        isActive: false,
      } as any);

      const result = await service.update(
        'user-2',
        { isActive: false },
        orgAdminUser,
      );

      expect(result).toMatchObject({ isActive: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-2' },
        data: { isActive: false },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          storeId: true,
          isActive: true,
        },
      });
    });
  });

  // `@CurrentUser()` khai kiểu JwtPayload nhưng runtime thật là bản ghi Prisma
  // `User` (JwtStrategy.validate() trả object đó, không phải payload JWT gốc)
  // — object ấy có `id`, không có `sub`. Test tra theo `email` (field có thật
  // ở cả hai phía) để không lặp lại bug tra `user.sub` ra `undefined`.
  describe('getProfile', () => {
    const meUser = {
      ...selectedUser,
      id: 'user-2',
      store: { name: 'Store 1' },
    };

    it('returns the profile of the currently authenticated user without passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue(meUser as any);

      const result = await service.getProfile({
        ...orgAdminUser,
        email: 'staff@cafe.com',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'staff@cafe.com' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          storeId: true,
          isActive: true,
          createdAt: true,
          store: { select: { name: true } },
        },
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException when the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getProfile({ ...orgAdminUser, email: 'missing@cafe.com' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('updates only the name of the authenticated user', async () => {
      prisma.user.update.mockResolvedValue({
        ...selectedUser,
        id: 'user-2',
        name: 'Tên mới',
      } as any);

      const result = await service.updateProfile(
        { ...orgAdminUser, email: 'staff@cafe.com' },
        { name: 'Tên mới' },
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'staff@cafe.com' },
        data: { name: 'Tên mới' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          storeId: true,
          isActive: true,
          createdAt: true,
        },
      });
      expect(result).toMatchObject({ name: 'Tên mới' });
    });

    // Schema chỉ có `name`, nhưng service vẫn phải chọn field tường minh —
    // không `...dto` — để field lạ không lọt qua nếu schema đổi sau này.
    it('ignores a role field slipped into the dto and does not escalate privileges', async () => {
      prisma.user.update.mockResolvedValue({
        ...selectedUser,
        id: 'user-2',
      } as any);

      await service.updateProfile(
        { ...orgAdminUser, email: 'staff@cafe.com' },
        {
          name: 'Tên mới',
          role: 'ORG_ADMIN',
        } as any,
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { name: 'Tên mới' },
        }),
      );
    });
  });

  describe('changePassword', () => {
    const meUser = {
      id: 'user-2',
      passwordHash: 'hashed-old-password',
    };

    it('hashes and saves the new password when the current password matches', async () => {
      prisma.user.findUnique.mockResolvedValue(meUser as any);
      jest
        .spyOn(require('bcrypt'), 'compare')
        .mockResolvedValueOnce(true as never) // current password check
        .mockResolvedValueOnce(false as never); // new !== old check
      const hashSpy = jest
        .spyOn(require('bcrypt'), 'hash')
        .mockResolvedValue('hashed-new-password' as never);

      const result = await service.changePassword(
        { ...orgAdminUser, email: 'staff@cafe.com' },
        { currentPassword: 'old-password', newPassword: 'new-password-123' },
      );

      expect(hashSpy).toHaveBeenCalledWith('new-password-123', 10);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { email: 'staff@cafe.com' },
        data: { passwordHash: 'hashed-new-password' },
      });
      expect(result).toEqual({ message: 'Password updated' });
    });

    it('throws UnauthorizedException when the current password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(meUser as any);
      jest
        .spyOn(require('bcrypt'), 'compare')
        .mockResolvedValue(false as never);

      await expect(
        service.changePassword(
          { ...orgAdminUser, email: 'staff@cafe.com' },
          {
            currentPassword: 'wrong-password',
            newPassword: 'new-password-123',
          },
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the new password is the same as the old one', async () => {
      prisma.user.findUnique.mockResolvedValue(meUser as any);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true as never);

      await expect(
        service.changePassword(
          { ...orgAdminUser, email: 'staff@cafe.com' },
          { currentPassword: 'old-password', newPassword: 'old-password' },
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword(
          { ...orgAdminUser, email: 'missing@cafe.com' },
          { currentPassword: 'old-password', newPassword: 'new-password-123' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    // Điểm dò mật khẩu thứ hai sau /auth/login — đếm theo user.email đã xác
    // thực, qua RedisThrottlerStorage trực tiếp vì ThrottlerGuard toàn cục
    // chạy trước JwtAuthGuard nên @Throttle không có req.user lúc tracker chạy.
    it('rate-limits repeated attempts for the same authenticated user', async () => {
      redisThrottler.increment.mockResolvedValue({
        totalHits: 6,
        timeToExpire: 60,
        isBlocked: true,
        timeToBlockExpire: 60,
      });

      await expect(
        service.changePassword(
          { ...orgAdminUser, email: 'staff@cafe.com' },
          { currentPassword: 'old-password', newPassword: 'new-password-123' },
        ),
      ).rejects.toThrow(HttpException);
      expect(redisThrottler.increment).toHaveBeenCalledWith(
        'me-password:staff@cafe.com',
        60_000,
        5,
        0,
        'default',
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
