import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.schema';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { RedisThrottlerStorageModule } from './common/throttler/redis-throttler-storage.module';
import { clientIpTracker } from './common/throttler/client-ip.tracker';
import { buildLoggerOptions } from './config/logger.config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TracksModule } from './modules/tracks/tracks.module';
import { PlaylistsModule } from './modules/playlists/playlists.module';
import { SyncModule } from './modules/sync/sync.module';
import { StoresModule } from './modules/stores/stores.module';
import { UsersModule } from './modules/users/users.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot(buildLoggerOptions(process.env)),
    // Counter nằm ở Redis + định danh client lấy từ header của edge, thay vì
    // `Map` trong RAM + `req.ip` do Express suy ra. Xem comment trong hai file
    // dưới để biết vì sao — cả hai đều là nguyên nhân làm rate limit login
    // không chặn nổi brute-force trên Railway.
    ThrottlerModule.forRootAsync({
      imports: [RedisThrottlerStorageModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        throttlers: [{ name: 'default', ttl: 60000, limit: 100 }],
        storage,
        getTracker: clientIpTracker,
      }),
    }),
    PrismaModule,
    AuthModule,
    TracksModule,
    PlaylistsModule,
    SyncModule,
    StoresModule,
    UsersModule,
    SchedulerModule,
    HealthModule,
  ],
  providers: [
    // ThrottlerModule chỉ cấu hình mức giới hạn — không có guard này thì
    // rate limit hoàn toàn không chạy.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
