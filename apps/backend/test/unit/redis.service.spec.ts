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

  it('stores group state as JSON with a 24h TTL', async () => {
    const service = buildService({ REDIS_URL: 'redis://localhost:6379' });
    const state = {
      groupId: 'group-1',
      playlistId: 'playlist-1',
      trackId: 'track-1',
      trackIndex: 0,
      positionMs: 0,
      startedAtServerTs: 1_700_000_000_000,
      isPlaying: true,
      mode: 'LOOSE' as const,
      status: 'PLAYING' as const,
    };

    await service.setGroupState('group-1', state);

    const client = (service as unknown as { client: { setex: jest.Mock } })
      .client;
    expect(client.setex).toHaveBeenCalledWith(
      'sync-group:group-1:state',
      86400,
      JSON.stringify(state),
    );
  });

  it('returns null when no group state is cached', async () => {
    const service = buildService({ REDIS_URL: 'redis://localhost:6379' });
    const client = (service as unknown as { client: { get: jest.Mock } })
      .client;
    client.get.mockResolvedValue(null);

    await expect(service.getGroupState('group-1')).resolves.toBeNull();
  });
});
