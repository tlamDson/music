import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { StoresService } from '../../src/modules/stores/stores.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SyncService } from '../../src/modules/sync/sync.service';
import { SyncGateway } from '../../src/modules/sync/sync.gateway';

describe('StoresService', () => {
  let service: StoresService;
  let prisma: DeepMockProxy<PrismaClient>;
  let syncService: jest.Mocked<SyncService>;
  let gateway: jest.Mocked<SyncGateway>;

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
    status: 'STOPPED' as const,
    currentTrackId: null,
    trackIndex: 0,
    startedAtTs: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();
    const syncMock = {
      nowPlayingForStore: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<SyncService>;
    const gatewayMock = {
      countStoreClients: jest.fn().mockReturnValue(0),
    } as unknown as jest.Mocked<SyncGateway>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StoresService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SyncService, useValue: syncMock },
        { provide: SyncGateway, useValue: gatewayMock },
      ],
    }).compile();

    service = module.get(StoresService);
    prisma = module.get(PrismaService);
    syncService = module.get(SyncService);
    gateway = module.get(SyncGateway);
  });

  describe('findAll', () => {
    it('should return stores scoped to the user organization', async () => {
      prisma.store.findMany.mockResolvedValue([mockStore] as any);

      const result = await service.findAll(orgAdminUser);

      expect(result).toEqual({ data: [mockStore] });
      expect(prisma.store.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    // Trang chi tiết quán là chỗ admin bấm phát — phải biết đang phát gì và có
    // màn hình nào đang nghe không, nếu không admin bấm xong chỉ biết đoán.
    it('trả kèm bài đang phát và số màn hình đang kết nối', async () => {
      prisma.store.findFirst.mockResolvedValue(mockStore as any);
      const nowPlaying = {
        storeId: 'store-1',
        track: {
          id: 'track-1',
          title: 'Cà phê sáng',
          artist: 'Vũ',
          durationMs: 180_000,
        },
        trackUrl: 'https://s3/a.mp3',
        positionMs: 1_000,
        serverTs: Date.now(),
        isPlaying: true,
        queue: { index: 0, total: 2, remaining: 1 },
      };
      (syncService.nowPlayingForStore as jest.Mock).mockResolvedValue(
        nowPlaying,
      );
      (gateway.countStoreClients as jest.Mock).mockReturnValue(3);

      const result = await service.findOne('store-1', orgAdminUser);

      expect(result).toMatchObject({
        id: 'store-1',
        name: 'Cafe Central',
        nowPlaying,
        connectedScreens: 3,
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

  describe('getStatus', () => {
    it('should return the projected status shape', async () => {
      prisma.store.findFirst.mockResolvedValue({
        ...mockStore,
        status: 'PLAYING',
        currentTrackId: 'track-1',
      } as any);
      (gateway.countStoreClients as jest.Mock).mockReturnValue(1);

      const result = await service.getStatus('store-1', orgAdminUser);

      expect(result).toEqual({
        storeId: 'store-1',
        name: 'Cafe Central',
        status: 'PLAYING',
        currentTrackId: 'track-1',
        connectedScreens: 1,
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
