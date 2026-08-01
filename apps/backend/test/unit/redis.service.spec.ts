import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../src/modules/sync/redis.service';

const redisConstructor = jest.fn();

jest.mock('ioredis', () => ({
  __esModule: true,
  default: class MockRedis {
    constructor(...args: unknown[]) {
      redisConstructor(...args);
    }
    setex = jest.fn();
    get = jest.fn();
    del = jest.fn();
    quit = jest.fn();
  },
}));

describe('RedisService', () => {
  const buildService = (env: Record<string, string | undefined>) => {
    const config = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
    return new RedisService(config);
  };

  beforeEach(() => {
    redisConstructor.mockClear();
  });

  it('connects using REDIS_URL when provided', () => {
    buildService({ REDIS_URL: 'redis://localhost:6379' });

    expect(redisConstructor).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({ lazyConnect: true }),
    );
  });

  it('connects using a TLS redis url with credentials', () => {
    const url = 'rediss://default:secret@redis.railway.internal:6379';
    buildService({ REDIS_URL: url });

    expect(redisConstructor).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ lazyConnect: true }),
    );
  });

  it('falls back to localhost when REDIS_URL is absent', () => {
    buildService({});

    expect(redisConstructor).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({ lazyConnect: true }),
    );
  });

  // Trạng thái phát của quán — quán là đơn vị phát duy nhất
  describe('store playback', () => {
    const playback = {
      storeId: 'store-1',
      playlistId: 'playlist-1',
      trackIds: ['track-1', 'track-2'],
      order: [0, 1],
      trackIndex: 0,
      positionMs: 0,
      startedAtServerTs: 1_700_000_000_000,
      isPlaying: true,
      repeat: 'OFF' as const,
      shuffle: false,
    };

    it('caches playback under a key of its own', async () => {
      const service = buildService({ REDIS_URL: 'redis://localhost:6379' });
      const client = (service as unknown as { client: { setex: jest.Mock } })
        .client;

      await service.setStorePlayback('store-1', playback);

      expect(client.setex).toHaveBeenCalledWith(
        'store:store-1:playback',
        86400,
        JSON.stringify(playback),
      );
    });

    it('reads cached playback back', async () => {
      const service = buildService({ REDIS_URL: 'redis://localhost:6379' });
      const client = (service as unknown as { client: { get: jest.Mock } })
        .client;
      client.get.mockResolvedValue(JSON.stringify(playback));

      await expect(service.getStorePlayback('store-1')).resolves.toEqual(
        playback,
      );
    });

    it('returns null when the store is not playing on its own', async () => {
      const service = buildService({ REDIS_URL: 'redis://localhost:6379' });
      const client = (service as unknown as { client: { get: jest.Mock } })
        .client;
      client.get.mockResolvedValue(null);

      await expect(service.getStorePlayback('store-1')).resolves.toBeNull();
    });

    // State cũ ghi trước khi thêm repeat/shuffle/order thiếu cả ba field —
    // chuẩn hoá phải nằm đúng một chỗ ở đây, không rải `??` khắp SyncService.
    it('normalizes legacy JSON missing order/repeat/shuffle', async () => {
      const service = buildService({ REDIS_URL: 'redis://localhost:6379' });
      const client = (service as unknown as { client: { get: jest.Mock } })
        .client;
      const legacy = {
        storeId: 'store-1',
        playlistId: 'playlist-1',
        trackIds: ['track-1', 'track-2'],
        trackIndex: 1,
        positionMs: 5_000,
        startedAtServerTs: 1_700_000_000_000,
        isPlaying: true,
      };
      client.get.mockResolvedValue(JSON.stringify(legacy));

      await expect(service.getStorePlayback('store-1')).resolves.toEqual({
        ...legacy,
        order: [0, 1],
        repeat: 'OFF',
        shuffle: false,
      });
    });

    it('clears playback', async () => {
      const service = buildService({ REDIS_URL: 'redis://localhost:6379' });
      const client = (service as unknown as { client: { del: jest.Mock } })
        .client;

      await service.clearStorePlayback('store-1');

      expect(client.del).toHaveBeenCalledWith('store:store-1:playback');
    });
  });
});
