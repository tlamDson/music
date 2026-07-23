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
      setStorePlayback: jest.fn().mockResolvedValue(undefined),
      getStorePlayback: jest.fn().mockResolvedValue(null),
      clearStorePlayback: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;
    const gatewayMock = {
      broadcastToGroup: jest.fn(),
      broadcastToStore: jest.fn(),
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

  // Web từng hardcode groupId 'sync-group-main' vì không có endpoint nào liệt
  // kê sync group.
  describe('groups', () => {
    it('lists sync groups of the caller organization with store counts', async () => {
      prisma.syncGroup.findMany.mockResolvedValue([mockGroup] as any);

      const result = await service.listGroups(orgAdminUser);

      expect(prisma.syncGroup.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        include: { _count: { select: { stores: true } } },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual({ data: [mockGroup] });
    });

    it('creates a sync group inside the caller organization', async () => {
      prisma.syncGroup.create.mockResolvedValue(mockGroup as any);

      await service.createGroup(
        { name: 'Quán trung tâm', mode: 'TIGHT' },
        orgAdminUser,
      );

      expect(prisma.syncGroup.create).toHaveBeenCalledWith({
        data: {
          name: 'Quán trung tâm',
          mode: 'TIGHT',
          organizationId: 'org-1',
        },
      });
    });

    it('defaults new groups to LOOSE mode', async () => {
      prisma.syncGroup.create.mockResolvedValue(mockGroup as any);

      await service.createGroup({ name: 'Nhóm mặc định' }, orgAdminUser);

      expect(prisma.syncGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ mode: 'LOOSE' }),
      });
    });
  });

  // Trước đây play() phát đúng một bài rồi im: hết bài là nhóm đứng hình, store
  // rejoin giữa chừng không có gì để nghe.
  describe('auto-next', () => {
    const twoTrackPlaylist = {
      id: 'playlist-1',
      name: 'Test',
      playlistTracks: [
        {
          trackId: 'track-1',
          position: 0,
          track: { id: 'track-1', s3Key: 'k1', durationMs: 180_000 },
        },
        {
          trackId: 'track-2',
          position: 1,
          track: { id: 'track-2', s3Key: 'k2', durationMs: 200_000 },
        },
      ],
    };

    const playingState = (trackIndex: number) => ({
      groupId: 'group-1',
      playlistId: 'playlist-1',
      trackId: `track-${trackIndex + 1}`,
      trackIndex,
      positionMs: 0,
      startedAtServerTs: Date.now(),
      isPlaying: true,
      mode: 'LOOSE' as const,
      status: 'PLAYING' as const,
    });

    beforeEach(() => {
      jest.useFakeTimers();
      prisma.syncGroup.findFirst.mockResolvedValue(mockGroup as any);
      prisma.playlist.findFirst.mockResolvedValue(twoTrackPlaylist as any);
      prisma.syncGroup.update.mockResolvedValue(mockGroup as any);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('plays the next track once the current one ends', async () => {
      redis.getGroupState.mockResolvedValue(playingState(0));

      await service.play(
        'group-1',
        { playlistId: 'playlist-1', trackIndex: 0, mode: 'LOOSE' },
        orgAdminUser,
      );
      gateway.broadcastToGroup.mockClear();

      await jest.advanceTimersByTimeAsync(180_000);

      expect(gateway.broadcastToGroup).toHaveBeenCalledWith(
        'group-1',
        'now-playing',
        expect.objectContaining({ trackId: 'track-2' }),
      );
    });

    it('stops the group after the last track instead of looping', async () => {
      redis.getGroupState.mockResolvedValue(playingState(1));

      await service.play(
        'group-1',
        { playlistId: 'playlist-1', trackIndex: 1, mode: 'LOOSE' },
        orgAdminUser,
      );
      gateway.broadcastToGroup.mockClear();

      await jest.advanceTimersByTimeAsync(200_000);

      expect(gateway.broadcastToGroup).toHaveBeenCalledWith(
        'group-1',
        'stopped',
        expect.any(Object),
      );
      expect(gateway.broadcastToGroup).not.toHaveBeenCalledWith(
        'group-1',
        'now-playing',
        expect.anything(),
      );
    });

    it('cancels the pending advance when the group is paused', async () => {
      redis.getGroupState.mockResolvedValue(playingState(0));

      await service.play(
        'group-1',
        { playlistId: 'playlist-1', trackIndex: 0, mode: 'LOOSE' },
        orgAdminUser,
      );
      await service.pause('group-1', orgAdminUser);
      gateway.broadcastToGroup.mockClear();

      await jest.advanceTimersByTimeAsync(180_000);

      expect(gateway.broadcastToGroup).not.toHaveBeenCalled();
    });

    it('does not schedule anything for tracks with unknown duration', async () => {
      prisma.playlist.findFirst.mockResolvedValue({
        ...twoTrackPlaylist,
        playlistTracks: [
          {
            trackId: 'track-1',
            position: 0,
            track: { id: 'track-1', s3Key: 'k1', durationMs: 0 },
          },
        ],
      } as any);
      redis.getGroupState.mockResolvedValue(playingState(0));

      await service.play(
        'group-1',
        { playlistId: 'playlist-1', trackIndex: 0, mode: 'LOOSE' },
        orgAdminUser,
      );
      gateway.broadcastToGroup.mockClear();

      await jest.advanceTimersByTimeAsync(600_000);

      expect(gateway.broadcastToGroup).not.toHaveBeenCalled();
    });

    // Timer nằm trong bộ nhớ nên restart backend là mất — phải dựng lại theo
    // thời lượng còn lại, nếu không nhạc đứng im sau mỗi lần deploy.
    it('reschedules playing groups after a restart', async () => {
      prisma.syncGroup.findMany.mockResolvedValue([mockGroup] as any);
      redis.getGroupState.mockResolvedValue({
        ...playingState(0),
        startedAtServerTs: Date.now() - 60_000,
      });
      prisma.track.findFirst.mockResolvedValue({
        id: 'track-1',
        durationMs: 180_000,
      } as any);

      await service.onModuleInit();
      gateway.broadcastToGroup.mockClear();

      await jest.advanceTimersByTimeAsync(120_000);

      expect(gateway.broadcastToGroup).toHaveBeenCalledWith(
        'group-1',
        'now-playing',
        expect.objectContaining({ trackId: 'track-2' }),
      );
    });
  });

  // Trước đây override() chỉ set cờ: không presign URL, không broadcast gì cả
  // nên quán bấm phát xong là im lặng hoàn toàn.
  describe('store local playback', () => {
    const storePlaylist = {
      id: 'playlist-1',
      name: 'Nhạc quán',
      playlistTracks: [
        {
          trackId: 'track-1',
          position: 0,
          track: { id: 'track-1', s3Key: 'k1', durationMs: 180_000 },
        },
        {
          trackId: 'track-2',
          position: 1,
          track: { id: 'track-2', s3Key: 'k2', durationMs: 200_000 },
        },
      ],
    };

    beforeEach(() => {
      prisma.store.findFirst.mockResolvedValue({
        id: 'store-1',
        organizationId: 'org-1',
        syncGroupId: 'group-1',
      } as any);
      prisma.playlist.findFirst.mockResolvedValue(storePlaylist as any);
    });

    it('broadcasts the track into the room of that store only', async () => {
      await service.playStore(
        'store-1',
        {
          playlistId: 'playlist-1',
          trackIndex: 0,
          returnToGroupOnFinish: true,
        },
        storeAdminUser,
      );

      expect(s3.getPresignedUrl).toHaveBeenCalledWith('k1');
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({
          storeId: 'store-1',
          trackId: 'track-1',
          trackUrl: 'https://s3/presigned/song.mp3',
        }),
      );
      expect(gateway.broadcastToGroup).not.toHaveBeenCalled();
    });

    it('marks the store as overridden so group broadcasts stop applying', async () => {
      await service.playStore(
        'store-1',
        {
          playlistId: 'playlist-1',
          trackIndex: 0,
          returnToGroupOnFinish: true,
        },
        storeAdminUser,
      );

      expect(redis.setStoreOverride).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({
          isOverridden: true,
          overridePlaylistId: 'playlist-1',
        }),
      );
    });

    it('stores the queue so a refresh can pick it back up', async () => {
      await service.playStore(
        'store-1',
        {
          playlistId: 'playlist-1',
          trackIndex: 0,
          returnToGroupOnFinish: true,
        },
        storeAdminUser,
      );

      expect(redis.setStorePlayback).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({
          storeId: 'store-1',
          playlistId: 'playlist-1',
          trackIds: ['track-1', 'track-2'],
          trackIndex: 0,
          isPlaying: true,
          returnToGroupOnFinish: true,
        }),
      );
    });

    it('reports how many tracks are left before returning to the group', async () => {
      await service.playStore(
        'store-1',
        {
          playlistId: 'playlist-1',
          trackIndex: 0,
          returnToGroupOnFinish: true,
        },
        storeAdminUser,
      );

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({
          queue: { index: 0, total: 2, remaining: 1 },
        }),
      );
    });

    it('refuses a store admin playing on another store', async () => {
      await expect(
        service.playStore(
          'store-1',
          {
            playlistId: 'playlist-1',
            trackIndex: 0,
            returnToGroupOnFinish: true,
          },
          { ...storeAdminUser, storeId: 'store-2' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(gateway.broadcastToStore).not.toHaveBeenCalled();
    });

    it('pauses local playback and keeps the position', async () => {
      redis.getStorePlayback.mockResolvedValue({
        storeId: 'store-1',
        playlistId: 'playlist-1',
        trackIds: ['track-1', 'track-2'],
        trackIndex: 0,
        positionMs: 0,
        startedAtServerTs: Date.now() - 30_000,
        isPlaying: true,
        returnToGroupOnFinish: true,
      });

      await service.pauseStore('store-1', storeAdminUser);

      expect(redis.setStorePlayback).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ isPlaying: false }),
      );
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-paused',
        expect.objectContaining({ storeId: 'store-1' }),
      );
    });

    it('resumes from the stored position instead of restarting the track', async () => {
      redis.getStorePlayback.mockResolvedValue({
        storeId: 'store-1',
        playlistId: 'playlist-1',
        trackIds: ['track-1', 'track-2'],
        trackIndex: 0,
        positionMs: 42_000,
        startedAtServerTs: Date.now() - 42_000,
        isPlaying: false,
        returnToGroupOnFinish: true,
      });

      await service.resumeStore('store-1', storeAdminUser);

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({ trackId: 'track-1', positionMs: 42_000 }),
      );
    });

    it('plays the next track in the local queue', async () => {
      redis.getStorePlayback.mockResolvedValue({
        storeId: 'store-1',
        playlistId: 'playlist-1',
        trackIds: ['track-1', 'track-2'],
        trackIndex: 0,
        positionMs: 0,
        startedAtServerTs: Date.now(),
        isPlaying: true,
        returnToGroupOnFinish: true,
      });

      await service.nextStore('store-1', storeAdminUser);

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({ trackId: 'track-2' }),
      );
    });

    it('clears the queue once the last track finishes', async () => {
      redis.getStorePlayback.mockResolvedValue({
        storeId: 'store-1',
        playlistId: 'playlist-1',
        trackIds: ['track-1', 'track-2'],
        trackIndex: 1,
        positionMs: 0,
        startedAtServerTs: Date.now(),
        isPlaying: true,
        returnToGroupOnFinish: true,
      });

      await service.nextStore('store-1', storeAdminUser);

      expect(redis.clearStorePlayback).toHaveBeenCalledWith('store-1');
      expect(gateway.broadcastToStore).not.toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.anything(),
      );
    });

    it('returns the current local playback state', async () => {
      const playback = {
        storeId: 'store-1',
        playlistId: 'playlist-1',
        trackIds: ['track-1'],
        trackIndex: 0,
        positionMs: 0,
        startedAtServerTs: Date.now(),
        isPlaying: true,
        returnToGroupOnFinish: true,
      };
      redis.getStorePlayback.mockResolvedValue(playback);

      await expect(
        service.getStorePlayback('store-1', storeAdminUser),
      ).resolves.toEqual(playback);
    });
  });

  // Admin cần nhìn một chỗ biết quán nào đang nghe theo chuỗi, quán nào tách ra
  describe('overview', () => {
    const stores = [
      {
        id: 'store-1',
        name: 'Quán Nguyễn Huệ',
        organizationId: 'org-1',
        syncGroupId: 'group-1',
        syncGroup: { id: 'group-1', name: 'Nhóm chính' },
        storeOverride: null,
      },
      {
        id: 'store-2',
        name: 'Quán Lê Lợi',
        organizationId: 'org-1',
        syncGroupId: 'group-1',
        syncGroup: { id: 'group-1', name: 'Nhóm chính' },
        storeOverride: { isOverridden: true },
      },
    ];

    it('lists stores of the caller organization only', async () => {
      prisma.store.findMany.mockResolvedValue(stores as any);

      await service.overview(orgAdminUser);

      expect(prisma.store.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        include: { storeOverride: true, syncGroup: true },
        orderBy: { name: 'asc' },
      });
    });

    it('reports the group track for a store following the chain', async () => {
      prisma.store.findMany.mockResolvedValue([stores[0]] as any);
      redis.getStorePlayback.mockResolvedValue(null);
      redis.getGroupState.mockResolvedValue({
        groupId: 'group-1',
        playlistId: 'playlist-1',
        trackId: 'track-9',
        trackIndex: 0,
        positionMs: 0,
        startedAtServerTs: Date.now(),
        isPlaying: true,
        mode: 'LOOSE',
        status: 'PLAYING',
      });

      const result = await service.overview(orgAdminUser);

      expect(result.data[0]).toMatchObject({
        storeId: 'store-1',
        name: 'Quán Nguyễn Huệ',
        syncGroupName: 'Nhóm chính',
        isOverridden: false,
        trackId: 'track-9',
        isPlaying: true,
        queueRemaining: null,
      });
    });

    it('reports the local queue for a store playing on its own', async () => {
      prisma.store.findMany.mockResolvedValue([stores[1]] as any);
      redis.getStorePlayback.mockResolvedValue({
        storeId: 'store-2',
        playlistId: 'playlist-2',
        trackIds: ['track-1', 'track-2', 'track-3'],
        trackIndex: 1,
        positionMs: 0,
        startedAtServerTs: Date.now(),
        isPlaying: true,
        returnToGroupOnFinish: true,
      });

      const result = await service.overview(orgAdminUser);

      expect(result.data[0]).toMatchObject({
        storeId: 'store-2',
        isOverridden: true,
        trackId: 'track-2',
        queueRemaining: 1,
      });
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

  // "Phát xong từng đây bài thì quay lại playlist ban đầu": hết hàng chờ riêng
  // là quán tự về dòng sync của admin, đúng bài đang phát và đúng giây.
  describe('auto rejoin after the local queue ends', () => {
    const groupPlaying = {
      groupId: 'group-1',
      playlistId: 'playlist-9',
      trackId: 'track-9',
      trackIndex: 0,
      positionMs: 0,
      startedAtServerTs: Date.now() - 45_000,
      isPlaying: true,
      mode: 'LOOSE' as const,
      status: 'PLAYING' as const,
    };

    const lastTrackQueue = {
      storeId: 'store-1',
      playlistId: 'playlist-1',
      trackIds: ['track-1', 'track-2'],
      trackIndex: 1,
      positionMs: 0,
      startedAtServerTs: Date.now(),
      isPlaying: true,
      returnToGroupOnFinish: true,
    };

    beforeEach(() => {
      prisma.store.findFirst.mockResolvedValue({
        id: 'store-1',
        organizationId: 'org-1',
        syncGroupId: 'group-1',
      } as any);
      prisma.track.findFirst.mockResolvedValue({
        id: 'track-9',
        s3Key: 'group-track.mp3',
      } as any);
    });

    it('drops the override when the last local track finishes', async () => {
      redis.getStorePlayback.mockResolvedValue(lastTrackQueue);
      redis.getGroupState.mockResolvedValue(groupPlaying);

      await service.nextStore('store-1', storeAdminUser);

      expect(redis.clearStoreOverride).toHaveBeenCalledWith('store-1');
      expect(redis.clearStorePlayback).toHaveBeenCalledWith('store-1');
    });

    it('resumes the group track at the position it is already at', async () => {
      redis.getStorePlayback.mockResolvedValue(lastTrackQueue);
      redis.getGroupState.mockResolvedValue(groupPlaying);

      await service.nextStore('store-1', storeAdminUser);

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'now-playing',
        expect.objectContaining({
          trackId: 'track-9',
          trackUrl: 'https://s3/presigned/song.mp3',
          positionMs: expect.any(Number),
        }),
      );

      const call = gateway.broadcastToStore.mock.calls.find(
        ([, event]) => event === 'now-playing',
      );
      const payload = call?.[2] as { positionMs: number };
      expect(payload.positionMs).toBeGreaterThanOrEqual(45_000);
    });

    it('stays detached when the store asked not to return', async () => {
      redis.getStorePlayback.mockResolvedValue({
        ...lastTrackQueue,
        returnToGroupOnFinish: false,
      });

      await service.nextStore('store-1', storeAdminUser);

      expect(redis.clearStoreOverride).not.toHaveBeenCalled();
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-stopped',
        expect.any(Object),
      );
    });

    it('stays silent when the group itself is stopped', async () => {
      redis.getStorePlayback.mockResolvedValue(lastTrackQueue);
      redis.getGroupState.mockResolvedValue({
        ...groupPlaying,
        isPlaying: false,
        status: 'STOPPED',
      });

      await service.nextStore('store-1', storeAdminUser);

      expect(redis.clearStoreOverride).toHaveBeenCalledWith('store-1');
      expect(gateway.broadcastToStore).not.toHaveBeenCalledWith(
        'store-1',
        'now-playing',
        expect.anything(),
      );
    });

    it('catches up mid-track when rejoining by hand', async () => {
      redis.getGroupState.mockResolvedValue(groupPlaying);

      await service.rejoin('store-1', storeAdminUser);

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'now-playing',
        expect.objectContaining({ trackId: 'track-9' }),
      );
    });

    it('clears any leftover local queue when rejoining by hand', async () => {
      redis.getGroupState.mockResolvedValue(groupPlaying);

      await service.rejoin('store-1', storeAdminUser);

      expect(redis.clearStorePlayback).toHaveBeenCalledWith('store-1');
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
