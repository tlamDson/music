import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { StorePlaybackState } from '@cafe-music/shared';

@Injectable()
export class RedisService {
  private client: Redis;
  private readonly PLAYBACK_TTL = 86400; // 24h

  constructor(private config: ConfigService) {
    // Railway/managed Redis cấp một connection string duy nhất (redis:// hoặc
    // rediss://), ioredis nhận trực tiếp URL nên không tách host/port/password.
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.client = new Redis(url, { lazyConnect: true });
  }

  // ── Trạng thái phát của quán ─────────────────────────────────────────────
  // Quán là đơn vị phát duy nhất: vị trí bài và hàng chờ đều thuộc về quán.

  async setStorePlayback(
    storeId: string,
    playback: StorePlaybackState,
  ): Promise<void> {
    await this.client.setex(
      `store:${storeId}:playback`,
      this.PLAYBACK_TTL,
      JSON.stringify(playback),
    );
  }

  async getStorePlayback(storeId: string): Promise<StorePlaybackState | null> {
    const data = await this.client.get(`store:${storeId}:playback`);
    return data ? (JSON.parse(data) as StorePlaybackState) : null;
  }

  async clearStorePlayback(storeId: string): Promise<void> {
    await this.client.del(`store:${storeId}:playback`);
  }

  /** Dùng cho readiness probe — trả 'PONG' khi kết nối còn sống. */
  async ping(): Promise<string> {
    return this.client.ping();
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}
