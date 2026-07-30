import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

/**
 * `ThrottlerStorageRecord` không được @nestjs/throttler re-export ở root —
 * lấy qua chính interface thay vì deep-import vào `dist/` (đường dẫn nội bộ,
 * đổi lúc nào không báo).
 */
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

/**
 * Đếm và hết hạn trong **một** lệnh: INCR rồi chỉ PEXPIRE ở hit đầu tiên (nếu
 * PEXPIRE mỗi hit thì cửa sổ bị đẩy lùi liên tục và không bao giờ đóng). Tách
 * thành hai lệnh rời sẽ mất counter khi hai request vào cùng lúc.
 */
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { hits, redis.call('PTTL', KEYS[1]) }
`;

/**
 * Lưu counter rate limit trong Redis thay vì RAM của process.
 *
 * `ThrottlerStorageService` mặc định của @nestjs/throttler giữ counter trong
 * một `Map` cục bộ, nên trên Railway nó mất sạch mỗi lần container bị thay và
 * mỗi instance lại đếm riêng — quan sát thật trên staging: cùng một client có
 * **hai** cửa sổ đếm song song (X-RateLimit-Reset trả 38 rồi 39), counter reset
 * giữa chừng và 8 lần login sai liên tiếp vẫn không ra 429.
 *
 * Redis đã là dependency cứng của app (trạng thái phát của quán) nên không phát
 * sinh hạ tầng mới. Client riêng chứ không tái dùng `RedisService`: cái đó thuộc
 * `SyncModule` và chỉ lo playback state — kéo cả `SyncModule` vào
 * `ThrottlerModule` là lệch tầng.
 */
@Injectable()
export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  /** Tách hẳn khỏi `store:*` để dữ liệu throttler không đụng state phát nhạc. */
  private static readonly KEY_PREFIX = 'throttle:';

  private readonly client: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.client = new Redis(url, { lazyConnect: true });
  }

  /**
   * `blockDuration` cố tình không được hiện thực hoá: repo chỉ dùng `ttl` +
   * `limit` (hai chỗ `@Throttle` ở `auth.controller.ts`), nên khoá kéo dài đúng
   * bằng cửa sổ đếm. Thêm cơ chế block riêng khi chưa ai cần chỉ tạo thêm chỗ sai.
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const [totalHits, ttlMs] = (await this.client.eval(
      INCREMENT_SCRIPT,
      1,
      `${RedisThrottlerStorage.KEY_PREFIX}${key}`,
      String(ttl),
    )) as [number, number];

    // PTTL trả -1 (không hạn) / -2 (key vừa biến mất) — cả hai đều không dùng
    // làm số giây được, rơi về ttl cấu hình.
    const timeToExpire = Math.ceil((ttlMs > 0 ? ttlMs : ttl) / 1000);
    const isBlocked = totalHits > limit;

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}
