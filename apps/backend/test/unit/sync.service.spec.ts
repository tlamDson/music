import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { SyncService } from '../../src/modules/sync/sync.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/modules/sync/redis.service';
import { SyncGateway } from '../../src/modules/sync/sync.gateway';
import { S3Service } from '../../src/modules/tracks/s3.service';

describe('SyncService', () => {
  let service: SyncService;
  let prisma: DeepMockProxy<PrismaClient>;
  let redis: jest.Mocked<RedisService>;
  let gateway: jest.Mocked<SyncGateway>;
  let s3: jest.Mocked<S3Service>;

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
    const s3Mock = {
      getPresignedUrl: jest
        .fn()
        .mockResolvedValue('https://s3/presigned/song.mp3'),
    } as unknown as jest.Mocked<S3Service>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
        { provide: SyncGateway, useValue: gatewayMock },
        { provide: S3Service, useValue: s3Mock },
      ],
    }).compile();

    service = module.get(SyncService);
    prisma = module.get(PrismaService);
    redis = module.get(RedisService);
    gateway = module.get(SyncGateway);
    s3 = module.get(S3Service);
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

    it('should include presigned trackUrl in now-playing broadcast so players can load audio', async () => {
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

      expect(s3.getPresignedUrl).toHaveBeenCalledWith('org-1/tracks/song.mp3');
      expect(gateway.broadcastToGroup).toHaveBeenCalledWith(
        'group-1',
        'now-playing',
        expect.objectContaining({
          trackId: 'track-1',
          trackUrl: 'https://s3/presigned/song.mp3',
        }),
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
      prisma.store.findFirst.mockResolvedValue({
        id: 'store-1',
        organizationId: 'org-1',
        syncGroupId: 'group-1',
      } as any);

      await service.override('store-1', { trackId: 'track-2' }, storeAdminUser);

      expect(redis.setStoreOverride).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ isOverridden: true }),
      );
    });
  });

  // Role guard chỉ chứng minh "là store admin", chưa nói gì về việc đó là store
  // admin của quán NÀO — thiếu check này thì quán A điều khiển được quán B.
  describe('store access control', () => {
    const otherStoreAdmin = {
      ...storeAdminUser,
      sub: 'user-3',
      storeId: 'store-2',
    };

    beforeEach(() => {
      prisma.store.findFirst.mockResolvedValue({
        id: 'store-1',
        organizationId: 'org-1',
        syncGroupId: 'group-1',
      } as any);
    });

    it('refuses override from a store admin of another store', async () => {
      await expect(
        service.override('store-1', {}, otherStoreAdmin),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(redis.setStoreOverride).not.toHaveBeenCalled();
      expect(prisma.storeOverride.upsert).not.toHaveBeenCalled();
    });

    it('refuses rejoin from a store admin of another store', async () => {
      await expect(
        service.rejoin('store-1', otherStoreAdmin),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(redis.clearStoreOverride).not.toHaveBeenCalled();
    });

    it('allows an org admin to override any store in their organization', async () => {
      await expect(
        service.override('store-1', {}, orgAdminUser),
      ).resolves.toEqual(expect.objectContaining({ isOverridden: true }));
    });

    it('scopes the store lookup to the caller organization', async () => {
      await service.override('store-1', {}, orgAdminUser);

      expect(prisma.store.findFirst).toHaveBeenCalledWith({
        where: { id: 'store-1', organizationId: 'org-1' },
      });
    });

    it('hides stores from other organizations behind a 404', async () => {
      prisma.store.findFirst.mockResolvedValue(null);

      await expect(
        service.override('store-9', {}, orgAdminUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(redis.setStoreOverride).not.toHaveBeenCalled();
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
