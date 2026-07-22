import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service';
import { HEALTH_CHECK_TIMEOUT_MS, withTimeout } from './with-timeout';

@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string, timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      // Query thật thay vì tin vào trạng thái connection pool
      await withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        timeoutMs,
        'Database query',
      );
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
