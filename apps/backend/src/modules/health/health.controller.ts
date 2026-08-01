import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

@Controller('health')
// Probe của Railway gọi liên tục — đừng để nó ăn hết quota rate limit
@SkipThrottle()
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaIndicator: PrismaHealthIndicator,
    private redisIndicator: RedisHealthIndicator,
  ) {}

  /**
   * Liveness: process còn sống hay không. Cố tình không chạm DB/Redis —
   * nếu Postgres chập chờn mà probe này fail thì Railway sẽ restart container
   * một cách vô ích, làm hỏng luôn phần đang chạy được.
   */
  @Get()
  liveness() {
    return { status: 'ok' };
  }

  /** Readiness: đủ dependency để phục vụ request thật chưa. */
  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.prismaIndicator.isHealthy('database'),
      () => this.redisIndicator.isHealthy('redis'),
    ]);
  }
}
