import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisService } from '../sync/redis.service';
import { HEALTH_CHECK_TIMEOUT_MS, withTimeout } from './with-timeout';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redis: RedisService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string, timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const reply = await withTimeout(
        this.redis.ping(),
        timeoutMs,
        'Redis ping',
      );
      if (reply !== 'PONG') {
        return indicator.down({ message: `Unexpected ping reply: ${reply}` });
      }
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
