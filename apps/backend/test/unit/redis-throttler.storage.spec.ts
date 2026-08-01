import { ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from '../../src/common/throttler/redis-throttler.storage';

const redisConstructor = jest.fn();

/**
 * Redis giả lập đủ để kiểm tra hợp đồng của storage: `eval` chạy script đếm
 * (INCR + PEXPIRE) nên mock giữ counter trong Map thay vì chạy Lua thật.
 * Class phải nằm TRONG factory — `jest.mock` được hoist lên đầu file nên tham
 * chiếu ra một class khai báo bên ngoài sẽ chạy trước lúc nó khởi tạo.
 */
interface MockRedis {
  eval: jest.Mock;
  quit: jest.Mock;
  expireKey(key: string): void;
}

jest.mock('ioredis', () => ({
  __esModule: true,
  default: class {
    hits = new Map<string, number>();
    ttls = new Map<string, number>();
    quit = jest.fn();

    constructor(...args: unknown[]) {
      redisConstructor(...args);
    }

    eval = jest.fn(
      (_script: string, _numKeys: number, key: string, ttlMs: string) => {
        const next = (this.hits.get(key) ?? 0) + 1;
        this.hits.set(key, next);
        if (next === 1) this.ttls.set(key, Number(ttlMs));
        return Promise.resolve([next, this.ttls.get(key) ?? -1]);
      },
    );

    /** Giả lập TTL hết hạn: key biến mất, lần đếm sau bắt đầu lại từ 1. */
    expireKey(key: string) {
      this.hits.delete(key);
      this.ttls.delete(key);
    }
  },
}));

describe('RedisThrottlerStorage', () => {
  const buildStorage = (env: Record<string, string | undefined> = {}) => {
    const config = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;
    const storage = new RedisThrottlerStorage(config);
    const client = (storage as unknown as { client: MockRedis }).client;
    return { storage, client };
  };

  beforeEach(() => {
    redisConstructor.mockClear();
  });

  it('connects using REDIS_URL with lazyConnect, same as RedisService', () => {
    buildStorage({ REDIS_URL: 'rediss://default:secret@redis.railway:6379' });

    expect(redisConstructor).toHaveBeenCalledWith(
      'rediss://default:secret@redis.railway:6379',
      expect.objectContaining({ lazyConnect: true }),
    );
  });

  it('falls back to localhost when REDIS_URL is absent', () => {
    buildStorage({});

    expect(redisConstructor).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({ lazyConnect: true }),
    );
  });

  it('counts hits per key and reports remaining window in seconds', async () => {
    const { storage } = buildStorage();

    const first = await storage.increment('key-a', 60_000, 5, 0, 'default');
    const second = await storage.increment('key-a', 60_000, 5, 0, 'default');

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    // Guard chỉ dùng giá trị này cho header Retry-After / X-RateLimit-Reset,
    // và bản in-memory của @nestjs/throttler trả giây — giữ cùng đơn vị.
    expect(second.timeToExpire).toBe(60);
    expect(second.isBlocked).toBe(false);
  });

  it('blocks once hits go past the limit', async () => {
    const { storage } = buildStorage();

    for (let i = 0; i < 5; i++) {
      const record = await storage.increment('key-a', 60_000, 5, 0, 'default');
      expect(record.isBlocked).toBe(false);
    }

    const sixth = await storage.increment('key-a', 60_000, 5, 0, 'default');

    expect(sixth.totalHits).toBe(6);
    expect(sixth.isBlocked).toBe(true);
    expect(sixth.timeToBlockExpire).toBe(60);
  });

  it('keeps a separate counter per key', async () => {
    const { storage } = buildStorage();

    for (let i = 0; i < 6; i++) {
      await storage.increment('key-a', 60_000, 5, 0, 'default');
    }
    const otherKey = await storage.increment('key-b', 60_000, 5, 0, 'default');

    expect(otherKey.totalHits).toBe(1);
    expect(otherKey.isBlocked).toBe(false);
  });

  /**
   * Đây là lý do tồn tại của class này: counter nằm ở Redis nên sống sót qua
   * việc Railway thay container và được chia sẻ giữa nhiều instance backend.
   * Bản in-memory mặc định của @nestjs/throttler mất sạch counter mỗi lần đó.
   */
  it('resets the counter only when the redis key expires', async () => {
    const { storage, client } = buildStorage();

    await storage.increment('key-a', 60_000, 5, 0, 'default');
    await storage.increment('key-a', 60_000, 5, 0, 'default');
    client.expireKey('throttle:key-a');

    const afterExpiry = await storage.increment(
      'key-a',
      60_000,
      5,
      0,
      'default',
    );

    expect(afterExpiry.totalHits).toBe(1);
  });

  it('namespaces keys so throttler data cannot collide with playback state', async () => {
    const { storage, client } = buildStorage();

    await storage.increment('key-a', 60_000, 5, 0, 'default');

    expect(client.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'throttle:key-a',
      '60000',
    );
  });

  it('closes the connection on shutdown', async () => {
    const { storage, client } = buildStorage();

    await storage.onApplicationShutdown();

    expect(client.quit).toHaveBeenCalled();
  });
});
