import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { SyncService } from '../../src/modules/sync/sync.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/modules/sync/redis.service';
import { SyncGateway } from '../../src/modules/sync/sync.gateway';

describe('SyncService', () => {
  let service: SyncService;
  let prisma: DeepMockProxy<PrismaClient>;
  let redis: jest.Mocked<RedisService>;
  let gateway: jest.Mocked<SyncGateway>;

  const orgAdminUser = {
    sub: 'user-1',
    email: 'admin@cafe.com',
    role: 'ORG_ADMIN' as const,
    organizationId: 'org-1',
    storeId: null,
  };

  const storeAdminUser = {
    sub: 'user-2',
    email: 'store1@cafe.com',
    role: 'STORE_ADMIN' as const,
    organizationId: 'org-1',
    storeId: 'store-1',
  };

  const mockGroup = {
    id: 'group-1',
    name: 'Main Group',
    organizationId: 'org-1',
    mode: 'LOOSE' as const,
    status: 'STOPPED' as const,
    currentTrackId: null,
    trackIndex: 0,
    startedAtTs: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPlaylist = {
    id: 'playlist-1',
    name: 'Test',
    playlistTracks: [
      {
        trackId: 'track-1',
        position: 0,
        track: { id: 'track-1', s3Key: 'org-1/tracks/song.mp3' },
      },
    ],
  };

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();
    const redisMock = {
      setGroupState: jest.fn().mockResolvedValue(undefined),
      getGroupState: jest.fn().mockResolvedValue(null),
      setStoreOverride: jest.fn().mockResolvedValue(undefined),
      getStoreOverride: jest.fn().mockResolvedValue(null),
      clearStoreOverride: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;
    const gatewayMock = {
      broadcastToGroup: jest.fn(),
      server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
    } as unknown as jest.Mocked<SyncGateway>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: SyncGateway, useValue: gatewayMock },
      ],
    }).compile();

    service = module.get(SyncService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    gateway = module.get(SyncGateway);
  });

  describe('play', () => {
    it('should set Redis state and broadcast now-playing event', async () => {
      prisma.syncGroup.findFirst.mockResolvedValue(mockGroup as any);
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as any);
      prisma.syncGroup.update.mockResolvedValue({
        ...mockGroup,
        status: 'PLAYING',
      } as any);

      await service.play(
        'group-1',
        { playlistId: 'playlist-1', trackIndex: 0, mode: 'LOOSE' },
        orgAdminUser,
      );

      expect(redis.setGroupState).toHaveBeenCalledWith(
        'group-1',
        expect.objectContaining({ isPlaying: true }),
      );
      expect(gateway.broadcastToGroup).toHaveBeenCalledWith(
        'group-1',
        'now-playing',
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when group does not exist', async () => {
      prisma.syncGroup.findFirst.mockResolvedValue(null);

      await expect(
        service.play(
          'nonexistent',
          { playlistId: 'playlist-1', trackIndex: 0, mode: 'LOOSE' },
          orgAdminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('override', () => {
    it('should set store override in Redis and disconnect store from sync group', async () => {
      await service.override('store-1', { trackId: 'track-2' }, storeAdminUser);

      expect(redis.setStoreOverride).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ isOverridden: true }),
      );
    });
  });

  describe('rejoin', () => {
    it('should clear store override and return current group state', async () => {
      redis.getGroupState.mockResolvedValue({
        groupId: 'group-1',
        playlistId: 'playlist-1',
        trackId: 'track-1',
        trackIndex: 0,
        positionMs: 5000,
        startedAtServerTs: Date.now() - 5000,
        isPlaying: true,
        mode: 'LOOSE',
        status: 'PLAYING',
      });

      prisma.store.findFirst.mockResolvedValue({
        id: 'store-1',
        syncGroupId: 'group-1',
      } as any);

      await service.rejoin('store-1', storeAdminUser);

      expect(redis.clearStoreOverride).toHaveBeenCalledWith('store-1');
    });
  });
});
