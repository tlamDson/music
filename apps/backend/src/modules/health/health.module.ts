import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { SyncModule } from '../sync/sync.module';

@Module({
  // SyncModule export RedisService — dùng lại đúng client đang chạy thay vì
  // mở thêm một kết nối riêng chỉ để healthcheck.
  imports: [TerminusModule, SyncModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
