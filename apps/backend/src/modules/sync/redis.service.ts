import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SyncGroupState, StoreOverride } from '@cafe-music/shared';

@Injectable()
export class RedisService {
  private client: Redis;
  private readonly GROUP_STATE_TTL = 86400; // 24h

  constructor(private config: ConfigService) {
    // Railway/managed Redis cấp một connection string duy nhất (redis:// hoặc
    // rediss://), ioredis nhận trực tiếp URL nên không tách host/port/password.
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    this.client = new Redis(url, { lazyConnect: true });
  }

  async setGroupState(groupId: string, state: SyncGroupState): Promise<void> {
    const key = `sync-group:${groupId}:state`;
    await this.client.setex(key, this.GROUP_STATE_TTL, JSON.stringify(state));
  }

  async getGroupState(groupId: string): Promise<SyncGroupState | null> {
    const key = `sync-group:${groupId}:state`;
    const data = await this.client.get(key);
    return data ? (JSON.parse(data) as SyncGroupState) : null;
  }

  async clearGroupState(groupId: string): Promise<void> {
    await this.client.del(`sync-group:${groupId}:state`);
  }

  async setStoreOverride(
    storeId: string,
    override: StoreOverride,
  ): Promise<void> {
    const key = `store:${storeId}:override`;
    await this.client.setex(
      key,
      this.GROUP_STATE_TTL,
      JSON.stringify(override),
    );
  }

  async getStoreOverride(storeId: string): Promise<StoreOverride | null> {
    const key = `store:${storeId}:override`;
    const data = await this.client.get(key);
    return data ? (JSON.parse(data) as StoreOverride) : null;
  }

  async clearStoreOverride(storeId: string): Promise<void> {
    await this.client.del(`store:${storeId}:override`);
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}
