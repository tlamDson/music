import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { StoresService } from '../../src/modules/stores/stores.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('StoresService', () => {
  let service: StoresService;
  let prisma: DeepMockProxy<PrismaClient>;

  const orgAdminUser = {
    sub: 'user-1',
    email: 'admin@cafe.com',
    role: 'ORG_ADMIN' as const,
    organizationId: 'org-1',
    storeId: null,
  };

  const mockStore = {
    id: 'store-1',
    name: 'Cafe Central',
    organizationId: 'org-1',
    syncGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoresService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(StoresService);
    prisma = module.get(PrismaService);
  });

  describe('findAll', () => {
    it('should return stores scoped to the user organization', async () => {
      prisma.store.findMany.mockResolvedValue([mockStore] as any);

      const result = await service.findAll(orgAdminUser);

      expect(result).toEqual({ data: [mockStore] });
      expect(prisma.store.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        include: { storeOverride: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return the store when found in the organization', async () => {
      prisma.store.findFirst.mockResolvedValue(mockStore as any);

      const result = await service.findOne('store-1', orgAdminUser);

      expect(result).toEqual(mockStore);
      expect(prisma.store.findFirst).toHaveBeenCalledWith({
        where: { id: 'store-1', organizationId: 'org-1' },
        include: { storeOverride: true, syncGroup: true },
      });
    });

    it('should throw NotFoundException when store is not in the organization', async () => {
      prisma.store.findFirst.mockResolvedValue(null);

      await expect(service.findOne('store-x', orgAdminUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a store with organizationId from the user', async () => {
      prisma.store.create.mockResolvedValue(mockStore as any);

      const result = await service.create(
        { name: 'Cafe Central' },
        orgAdminUser,
      );

      expect(result).toEqual(mockStore);
      expect(prisma.store.create).toHaveBeenCalledWith({
        data: {
          name: 'Cafe Central',
          organizationId: 'org-1',
          syncGroupId: null,
        },
      });
    });

    it('should pass syncGroupId through when provided', async () => {
      prisma.store.create.mockResolvedValue({
        ...mockStore,
        syncGroupId: 'group-1',
      } as any);

      await service.create(
        { name: 'Cafe Central', syncGroupId: 'group-1' },
        orgAdminUser,
      );

      expect(prisma.store.create).toHaveBeenCalledWith({
        data: {
          name: 'Cafe Central',
          organizationId: 'org-1',
          syncGroupId: 'group-1',
        },
      });
    });
  });

  describe('update', () => {
    it('should throw NotFoundException and not update when store is outside the organization', async () => {
      prisma.store.findFirst.mockResolvedValue(null);

      await expect(
        service.update('store-x', { name: 'New Name' }, orgAdminUser),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.store.update).not.toHaveBeenCalled();
    });

    it('should update the store when it belongs to the organization', async () => {
      prisma.store.findFirst.mockResolvedValue(mockStore as any);
      prisma.store.update.mockResolvedValue({
        ...mockStore,
        name: 'New Name',
      } as any);

      const result = await service.update(
        'store-1',
        { name: 'New Name' },
        orgAdminUser,
      );

      expect(result).toMatchObject({ name: 'New Name' });
      expect(prisma.store.update).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        data: { name: 'New Name' },
      });
    });
  });

  describe('assignGroup', () => {
    const mockGroup = {
      id: 'group-1',
      name: 'Group A',
      organizationId: 'org-1',
    };

    it('should assign the sync group when store and group are in the organization', async () => {
      prisma.store.findFirst.mockResolvedValue(mockStore as any);
      prisma.syncGroup.findFirst.mockResolvedValue(mockGroup as any);
      prisma.store.update.mockResolvedValue({
        ...mockStore,
        syncGroupId: 'group-1',
      } as any);

      const result = await service.assignGroup(
        'store-1',
        'group-1',
        orgAdminUser,
      );

      expect(result).toMatchObject({ syncGroupId: 'group-1' });
      expect(prisma.syncGroup.findFirst).toHaveBeenCalledWith({
        where: { id: 'group-1', organizationId: 'org-1' },
      });
      expect(prisma.store.update).toHaveBeenCalledWith({
        where: { id: 'store-1' },
        data: { syncGroupId: 'group-1' },
      });
    });

    it('should throw NotFoundException when store is missing', async () => {
      prisma.store.findFirst.mockResolvedValue(null);

      await expect(
        service.assignGroup('store-x', 'group-1', orgAdminUser),
      ).rejects.toThrow('Store not found');
      expect(prisma.store.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when sync group is missing', async () => {
      prisma.store.findFirst.mockResolvedValue(mockStore as any);
      prisma.syncGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.assignGroup('store-1', 'group-x', orgAdminUser),
      ).rejects.toThrow('Sync group not found');
      expect(prisma.store.update).not.toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return the projected status shape', async () => {
      const override = { id: 'override-1', storeId: 'store-1' };
      const group = { id: 'group-1', name: 'Group A' };
      prisma.store.findFirst.mockResolvedValue({
        ...mockStore,
        syncGroupId: 'group-1',
        syncGroup: group,
        storeOverride: override,
      } as any);

      const result = await service.getStatus('store-1', orgAdminUser);

      expect(result).toEqual({
        storeId: 'store-1',
        name: 'Cafe Central',
        syncGroupId: 'group-1',
        syncGroup: group,
        override,
      });
    });

    it('should throw NotFoundException when store is missing', async () => {
      prisma.store.findFirst.mockResolvedValue(null);

      await expect(service.getStatus('store-x', orgAdminUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
