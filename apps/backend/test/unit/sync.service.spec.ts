import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { SyncService } from '../../src/modules/sync/sync.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/modules/sync/redis.service';
import { SyncGateway } from '../../src/modules/sync/sync.gateway';
import { S3Service } from '../../src/modules/tracks/s3.service';
import type { StoreRepeatMode } from '@cafe-music/shared';

// Chỉ để dựng một RedisService THẬT (không mock toàn bộ) cho case tương thích
// ngược với state cũ — không cần kết nối Redis thật vì thay `client` bằng
// stub ngay sau khi tạo, giống kỹ thuật ở redis.service.spec.ts.
jest.mock('ioredis', () => ({
  __esModule: true,
  default: class MockRedis {
    setex = jest.fn();
    get = jest.fn();
    del = jest.fn();
    quit = jest.fn();
  },
}));

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

  const mockStore = {
    id: 'store-1',
    name: 'Quán Nguyễn Huệ',
    organizationId: 'org-1',
    status: 'STOPPED' as const,
    currentTrackId: null,
    trackIndex: 0,
    startedAtTs: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const trackA = {
    id: 'track-1',
    title: 'Cà phê sáng',
    artist: 'Vũ',
    durationMs: 180_000,
    s3Key: 'org-1/tracks/a.mp3',
  };

  const trackB = {
    id: 'track-2',
    title: 'Hạ trắng',
    artist: 'Khánh Ly',
    durationMs: 200_000,
    s3Key: 'org-1/tracks/b.mp3',
  };

  const mockPlaylist = {
    id: 'playlist-1',
    name: 'Test',
    playlistTracks: [
      { trackId: trackA.id, position: 0, track: trackA },
      { trackId: trackB.id, position: 1, track: trackB },
    ],
  };

  /**
   * Hàng chờ 2 bài của quán, đang ở bài thứ `trackIndex`. Mặc định
   * `order: [0, 1]` (đúng thứ tự playlist), `repeat: 'OFF'`, `shuffle: false`
   * — override khi test cần state khác, y hệt shape `RedisService` chuẩn hoá
   * trả về trong thực tế.
   */
  const playbackAt = (
    trackIndex: number,
    isPlaying = true,
    overrides: Partial<{
      order: number[];
      repeat: StoreRepeatMode;
      shuffle: boolean;
    }> = {},
  ) => ({
    storeId: 'store-1',
    playlistId: 'playlist-1',
    trackIds: [trackA.id, trackB.id],
    order: overrides.order ?? [0, 1],
    trackIndex,
    positionMs: 0,
    startedAtServerTs: Date.now(),
    isPlaying,
    repeat: overrides.repeat ?? 'OFF',
    shuffle: overrides.shuffle ?? false,
  });

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();
    const redisMock = {
      setStorePlayback: jest.fn().mockResolvedValue(undefined),
      getStorePlayback: jest.fn().mockResolvedValue(null),
      clearStorePlayback: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RedisService>;
    const gatewayMock = {
      broadcastToStore: jest.fn(),
      countStoreClients: jest.fn().mockReturnValue(0),
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

    prisma.store.findFirst.mockResolvedValue(mockStore as never);
    prisma.store.update.mockResolvedValue(mockStore as never);
    prisma.store.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('playStore', () => {
    it('lưu hàng chờ vào Redis và broadcast store-now-playing kèm metadata bài', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await service.playStore(
        'store-1',
        { playlistId: 'playlist-1', trackIndex: 0 },
        orgAdminUser,
      );

      expect(redis.setStorePlayback).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({
          storeId: 'store-1',
          playlistId: 'playlist-1',
          trackIds: [trackA.id, trackB.id],
          trackIndex: 0,
          isPlaying: true,
        }),
      );

      // Thiếu `track` thì client phải gọi thêm API mới dựng được thanh phát,
      // và màn kiosk in thẳng cuid ra TV.
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({
          storeId: 'store-1',
          trackId: trackA.id,
          track: expect.objectContaining({
            id: trackA.id,
            title: 'Cà phê sáng',
            durationMs: 180_000,
          }),
          trackUrl: 'https://s3/presigned/song.mp3',
          queue: { index: 0, total: 2, remaining: 1 },
        }),
      );
    });

    it('ghi trạng thái phát xuống DB để sống sót qua restart', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await service.playStore(
        'store-1',
        { playlistId: 'playlist-1', trackIndex: 0 },
        orgAdminUser,
      );

      expect(prisma.store.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'store-1' },
          data: expect.objectContaining({
            status: 'PLAYING',
            currentTrackId: trackA.id,
            trackIndex: 0,
          }),
        }),
      );
    });

    it('phát từ giữa playlist khi có trackIndex', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await service.playStore(
        'store-1',
        { playlistId: 'playlist-1', trackIndex: 1 },
        orgAdminUser,
      );

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({
          trackId: trackB.id,
          queue: { index: 1, total: 2, remaining: 0 },
        }),
      );
    });

    it('báo lỗi thật khi playlist rỗng, không đoán bừa', async () => {
      prisma.playlist.findFirst.mockResolvedValue({
        ...mockPlaylist,
        playlistTracks: [],
      } as never);

      await expect(
        service.playStore(
          'store-1',
          { playlistId: 'playlist-1', trackIndex: 0 },
          orgAdminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('không cho phát playlist của tổ chức khác', async () => {
      prisma.playlist.findFirst.mockResolvedValue(null);

      await expect(
        service.playStore(
          'store-1',
          { playlistId: 'playlist-other-org', trackIndex: 0 },
          orgAdminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('phân quyền theo quán', () => {
    it('chặn store admin điều khiển quán khác', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await expect(
        service.playStore(
          'store-2',
          { playlistId: 'playlist-1', trackIndex: 0 },
          storeAdminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cho store admin điều khiển đúng quán của mình', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await expect(
        service.playStore(
          'store-1',
          { playlistId: 'playlist-1', trackIndex: 0 },
          storeAdminUser,
        ),
      ).resolves.toBeDefined();
    });

    it('trả 404 cho quán ngoài tổ chức để không lộ sự tồn tại', async () => {
      prisma.store.findFirst.mockResolvedValue(null);

      await expect(
        service.playStore(
          'store-other-org',
          { playlistId: 'playlist-1', trackIndex: 0 },
          orgAdminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pauseStore', () => {
    it('gộp thời gian đã trôi vào positionMs để hydrate lúc dừng đọc đúng chỗ', async () => {
      redis.getStorePlayback.mockResolvedValue({
        ...playbackAt(0),
        positionMs: 5_000,
        startedAtServerTs: Date.now() - 30_000,
      } as never);

      const paused = await service.pauseStore('store-1', orgAdminUser);

      expect(paused.isPlaying).toBe(false);
      expect(paused.positionMs).toBeGreaterThanOrEqual(34_000);
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-paused',
        expect.objectContaining({ storeId: 'store-1' }),
      );
    });

    it('báo lỗi khi quán không phát gì', async () => {
      redis.getStorePlayback.mockResolvedValue(null);

      await expect(service.pauseStore('store-1', orgAdminUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('nextStore', () => {
    it('sang bài kế và cập nhật hàng chờ', async () => {
      redis.getStorePlayback.mockResolvedValue(playbackAt(0) as never);
      prisma.track.findFirst.mockResolvedValue(trackB as never);

      const result = await service.nextStore('store-1', orgAdminUser);

      expect(result.finished).toBe(false);
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({
          trackId: trackB.id,
          queue: { index: 1, total: 2, remaining: 0 },
        }),
      );
    });

    it('hết hàng chờ thì dừng hẳn và dọn state', async () => {
      redis.getStorePlayback.mockResolvedValue(playbackAt(1) as never);

      const result = await service.nextStore('store-1', orgAdminUser);

      expect(result.finished).toBe(true);
      expect(redis.clearStorePlayback).toHaveBeenCalledWith('store-1');
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-stopped',
        expect.objectContaining({ storeId: 'store-1' }),
      );
    });
  });

  describe('auto-next do server lái', () => {
    // Để client bắt `ended` rồi gọi next là sai: quán mở hai màn hình thì mỗi
    // màn bắn một lệnh và nhạc nhảy cóc, còn không màn nào mở thì nhạc đứng im.
    it('tự chuyển bài đúng lúc hết thời lượng mà không cần client', async () => {
      jest.useFakeTimers();
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await service.playStore(
        'store-1',
        { playlistId: 'playlist-1', trackIndex: 0 },
        orgAdminUser,
      );

      redis.getStorePlayback.mockResolvedValue(playbackAt(0) as never);
      prisma.track.findFirst.mockResolvedValue(trackB as never);
      gateway.broadcastToStore.mockClear();

      await jest.advanceTimersByTimeAsync(trackA.durationMs + 10);

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({ trackId: trackB.id }),
      );
    });

    it('dừng hẳn sau bài cuối, không lặp lại playlist', async () => {
      jest.useFakeTimers();
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await service.playStore(
        'store-1',
        { playlistId: 'playlist-1', trackIndex: 1 },
        orgAdminUser,
      );

      redis.getStorePlayback.mockResolvedValue(playbackAt(1) as never);
      gateway.broadcastToStore.mockClear();

      await jest.advanceTimersByTimeAsync(trackB.durationMs + 10);

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-stopped',
        expect.objectContaining({ storeId: 'store-1' }),
      );
    });

    it('tạm dừng thì huỷ timer, không tự nhảy bài trong lúc đang dừng', async () => {
      jest.useFakeTimers();
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await service.playStore(
        'store-1',
        { playlistId: 'playlist-1', trackIndex: 0 },
        orgAdminUser,
      );

      redis.getStorePlayback.mockResolvedValue(playbackAt(0) as never);
      await service.pauseStore('store-1', orgAdminUser);
      gateway.broadcastToStore.mockClear();

      await jest.advanceTimersByTimeAsync(trackA.durationMs + 10);

      expect(gateway.broadcastToStore).not.toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.anything(),
      );
    });

    it('track chưa biết thời lượng (durationMs = 0) thì không hẹn giờ bừa', async () => {
      jest.useFakeTimers();
      prisma.playlist.findFirst.mockResolvedValue({
        ...mockPlaylist,
        playlistTracks: [
          {
            trackId: 'track-0',
            position: 0,
            track: { ...trackA, durationMs: 0 },
          },
          { trackId: trackB.id, position: 1, track: trackB },
        ],
      } as never);

      await service.playStore(
        'store-1',
        { playlistId: 'playlist-1', trackIndex: 0 },
        orgAdminUser,
      );
      gateway.broadcastToStore.mockClear();

      await jest.advanceTimersByTimeAsync(600_000);

      expect(gateway.broadcastToStore).not.toHaveBeenCalled();
    });
  });

  describe('nowPlayingForStore', () => {
    // Broadcast WS không replay khi join room — mở trang sau lúc admin bấm phát
    // mà thiếu cái này thì trang trắng tới tận lần chuyển bài kế tiếp.
    it('bù thời gian đã trôi để client vào giữa bài không tua về đầu', async () => {
      redis.getStorePlayback.mockResolvedValue({
        ...playbackAt(0),
        positionMs: 0,
        startedAtServerTs: Date.now() - 42_000,
      } as never);
      prisma.track.findFirst.mockResolvedValue(trackA as never);

      const snapshot = await service.nowPlayingForStore(
        'store-1',
        orgAdminUser,
      );

      expect(snapshot).toMatchObject({
        storeId: 'store-1',
        isPlaying: true,
        queue: { index: 0, total: 2, remaining: 1 },
      });
      expect(snapshot!.positionMs).toBeGreaterThanOrEqual(42_000);
      expect(snapshot!.track.title).toBe('Cà phê sáng');
    });

    it('trả null khi quán chưa phát gì', async () => {
      redis.getStorePlayback.mockResolvedValue(null);

      await expect(
        service.nowPlayingForStore('store-1', orgAdminUser),
      ).resolves.toBeNull();
    });

    it('giữ nguyên positionMs khi đang tạm dừng', async () => {
      redis.getStorePlayback.mockResolvedValue({
        ...playbackAt(0, false),
        positionMs: 12_000,
        startedAtServerTs: Date.now() - 99_000,
      } as never);
      prisma.track.findFirst.mockResolvedValue(trackA as never);

      const snapshot = await service.nowPlayingForStore(
        'store-1',
        orgAdminUser,
      );

      expect(snapshot!.positionMs).toBe(12_000);
      expect(snapshot!.isPlaying).toBe(false);
    });
  });

  describe('overview', () => {
    it('liệt kê từng quán kèm hàng chờ và số màn hình đang kết nối', async () => {
      prisma.store.findMany.mockResolvedValue([mockStore] as never);
      redis.getStorePlayback.mockResolvedValue(playbackAt(0) as never);
      (gateway.countStoreClients as jest.Mock).mockReturnValue(2);

      const { data } = await service.overview(orgAdminUser);

      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({
        storeId: 'store-1',
        name: 'Quán Nguyễn Huệ',
        isPlaying: true,
        trackId: trackA.id,
        queueRemaining: 1,
        connectedScreens: 2,
      });
    });

    it('quán không phát gì thì báo dừng, không vỡ', async () => {
      prisma.store.findMany.mockResolvedValue([mockStore] as never);
      redis.getStorePlayback.mockResolvedValue(null);

      const { data } = await service.overview(orgAdminUser);

      expect(data[0]).toMatchObject({
        isPlaying: false,
        trackId: null,
        queueRemaining: null,
      });
    });
  });

  describe('onModuleInit', () => {
    it('dựng lại timer chuyển bài theo thời lượng còn lại sau restart', async () => {
      jest.useFakeTimers();
      prisma.store.findMany.mockResolvedValue([
        { ...mockStore, status: 'PLAYING' },
      ] as never);
      redis.getStorePlayback.mockResolvedValue({
        ...playbackAt(0),
        positionMs: 0,
        startedAtServerTs: Date.now() - 179_000,
      } as never);
      prisma.track.findFirst.mockResolvedValue(trackA as never);

      await service.onModuleInit();
      prisma.track.findFirst.mockResolvedValue(trackB as never);
      gateway.broadcastToStore.mockClear();

      // Còn khoảng 1s nữa là hết bài đầu
      await jest.advanceTimersByTimeAsync(1_500);

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({ trackId: trackB.id }),
      );
    });

    it('bỏ qua quán không còn state trong Redis', async () => {
      prisma.store.findMany.mockResolvedValue([
        { ...mockStore, status: 'PLAYING' },
      ] as never);
      redis.getStorePlayback.mockResolvedValue(null);

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('repeat', () => {
    it('ONE: hết bài phát lại chính nó, không sang bài kế', async () => {
      jest.useFakeTimers();
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await service.playStore(
        'store-1',
        { playlistId: 'playlist-1', trackIndex: 0 },
        orgAdminUser,
      );

      redis.getStorePlayback.mockResolvedValue(
        playbackAt(0, true, { repeat: 'ONE' }) as never,
      );
      prisma.track.findFirst.mockResolvedValue(trackA as never);
      gateway.broadcastToStore.mockClear();

      await jest.advanceTimersByTimeAsync(trackA.durationMs + 10);

      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({
          trackId: trackA.id,
          queue: { index: 0, total: 2, remaining: 1 },
        }),
      );
    });

    it('ALL: hết queue quay về đầu thay vì dừng', async () => {
      jest.useFakeTimers();
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as never);

      await service.playStore(
        'store-1',
        { playlistId: 'playlist-1', trackIndex: 1 },
        orgAdminUser,
      );

      redis.getStorePlayback.mockResolvedValue(
        playbackAt(1, true, { repeat: 'ALL' }) as never,
      );
      prisma.track.findFirst.mockResolvedValue(trackA as never);
      gateway.broadcastToStore.mockClear();

      await jest.advanceTimersByTimeAsync(trackB.durationMs + 10);

      expect(redis.clearStorePlayback).not.toHaveBeenCalled();
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({
          trackId: trackA.id,
          queue: { index: 0, total: 2, remaining: 1 },
        }),
      );
    });

    // Test sẵn có "dừng hẳn sau bài cuối, không lặp lại playlist" (repeat mặc
    // định OFF) đứng riêng phía trên vẫn phải xanh — đây chính là hành vi mặc
    // định khi không truyền repeat.
  });

  describe('shuffle', () => {
    it('bật giữa chừng: bài đang phát nằm đầu order mới, order vẫn là hoán vị đủ mọi chỉ số', async () => {
      redis.getStorePlayback.mockResolvedValue(playbackAt(1) as never);

      const result = await service.setPlaybackMode(
        'store-1',
        { shuffle: true },
        orgAdminUser,
      );

      expect(result.shuffle).toBe(true);
      // Đang ở order[1] = 1 (trackB) trước khi bật shuffle → phải đứng đầu order mới.
      expect(result.order[0]).toBe(1);
      expect(result.trackIndex).toBe(0);
      expect([...result.order].sort()).toEqual([0, 1]);
      expect(redis.setStorePlayback).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ shuffle: true }),
      );
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-mode-changed',
        { storeId: 'store-1', repeat: 'OFF', shuffle: true },
      );
    });

    it('tắt shuffle: quay về đúng thứ tự playlist gốc', async () => {
      redis.getStorePlayback.mockResolvedValue(
        playbackAt(0, true, { order: [1, 0], shuffle: true }) as never,
      );

      const result = await service.setPlaybackMode(
        'store-1',
        { shuffle: false },
        orgAdminUser,
      );

      expect(result.shuffle).toBe(false);
      expect(result.order).toEqual([0, 1]);
      // order[0] trước đó (=1, trackB) phải vẫn là bài đang phát sau khi tắt shuffle.
      expect(result.trackIndex).toBe(1);
    });

    it('đổi mode không làm gián đoạn nhạc — không gọi lại startStoreTrack/broadcast store-now-playing', async () => {
      redis.getStorePlayback.mockResolvedValue(playbackAt(0) as never);
      gateway.broadcastToStore.mockClear();

      await service.setPlaybackMode('store-1', { repeat: 'ALL' }, orgAdminUser);

      expect(gateway.broadcastToStore).not.toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.anything(),
      );
    });

    it('chặn store admin quán khác đổi mode', async () => {
      await expect(
        service.setPlaybackMode('store-2', { shuffle: true }, storeAdminUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('previousStore', () => {
    it('đã phát quá 3s thì tua về đầu bài hiện tại', async () => {
      redis.getStorePlayback.mockResolvedValue({
        ...playbackAt(1),
        positionMs: 0,
        startedAtServerTs: Date.now() - 5_000,
      } as never);
      prisma.track.findFirst.mockResolvedValue(trackB as never);

      const result = await service.previousStore('store-1', orgAdminUser);

      expect(result.trackIndex).toBe(1);
      expect(result.positionMs).toBe(0);
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({ trackId: trackB.id }),
      );
    });

    it('mới phát dưới 3s thì lùi một bài', async () => {
      redis.getStorePlayback.mockResolvedValue({
        ...playbackAt(1),
        positionMs: 0,
        startedAtServerTs: Date.now() - 1_000,
      } as never);
      prisma.track.findFirst.mockResolvedValue(trackA as never);

      const result = await service.previousStore('store-1', orgAdminUser);

      expect(result.trackIndex).toBe(0);
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({ trackId: trackA.id }),
      );
    });

    it('ở bài đầu mà repeat OFF thì tua về đầu bài đó', async () => {
      redis.getStorePlayback.mockResolvedValue({
        ...playbackAt(0),
        positionMs: 0,
        startedAtServerTs: Date.now() - 1_000,
      } as never);
      prisma.track.findFirst.mockResolvedValue(trackA as never);

      const result = await service.previousStore('store-1', orgAdminUser);

      expect(result.trackIndex).toBe(0);
      expect(result.positionMs).toBe(0);
    });

    it('ở bài đầu mà repeat ALL thì nhảy về bài cuối', async () => {
      redis.getStorePlayback.mockResolvedValue({
        ...playbackAt(0, true, { repeat: 'ALL' }),
        positionMs: 0,
        startedAtServerTs: Date.now() - 1_000,
      } as never);
      prisma.track.findFirst.mockResolvedValue(trackB as never);

      const result = await service.previousStore('store-1', orgAdminUser);

      expect(result.trackIndex).toBe(1);
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({ trackId: trackB.id }),
      );
    });

    it('báo lỗi khi quán không phát gì', async () => {
      redis.getStorePlayback.mockResolvedValue(null);

      await expect(
        service.previousStore('store-1', orgAdminUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('chặn store admin quán khác gọi previous', async () => {
      await expect(
        service.previousStore('store-2', storeAdminUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('tương thích ngược với state Redis cũ', () => {
    // State cũ (ghi trước khi thêm repeat/shuffle/order) không có cả ba field
    // này. RedisService chuẩn hoá đúng một chỗ — ở đây dựng một RedisService
    // THẬT (chỉ thay `client` bằng stub, không kết nối Redis thật) để xác
    // nhận SyncService chạy được xuyên suốt qua tầng đó, không phải qua mock
    // đã tự bịa sẵn field.
    it('vẫn nhảy bài đúng khi Redis trả JSON thiếu order/repeat/shuffle', async () => {
      const realRedis = new RedisService({
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService);
      const fakeClient = (
        realRedis as unknown as { client: { get: jest.Mock } }
      ).client;

      const legacyState = {
        storeId: 'store-1',
        playlistId: 'playlist-1',
        trackIds: [trackA.id, trackB.id],
        trackIndex: 0,
        positionMs: 0,
        startedAtServerTs: Date.now(),
        isPlaying: true,
      };
      fakeClient.get.mockResolvedValue(JSON.stringify(legacyState));

      const s3Stub = {
        getPresignedUrl: jest.fn().mockResolvedValue('https://s3/x.mp3'),
      } as unknown as S3Service;
      const legacyAwareService = new SyncService(
        prisma as unknown as PrismaService,
        realRedis,
        gateway,
        s3Stub,
      );

      prisma.track.findFirst.mockResolvedValue(trackB as never);

      const result = await legacyAwareService.nextStore(
        'store-1',
        orgAdminUser,
      );

      expect(result.finished).toBe(false);
      expect(gateway.broadcastToStore).toHaveBeenCalledWith(
        'store-1',
        'store-now-playing',
        expect.objectContaining({
          trackId: trackB.id,
          repeat: 'OFF',
          shuffle: false,
        }),
      );
    });
  });
});
