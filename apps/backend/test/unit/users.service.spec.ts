import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { UsersService } from '../../src/modules/users/users.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaClient>;

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
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(UsersService);
    prisma = module.get(PrismaService);
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
        },
      });
    });
  });
});
