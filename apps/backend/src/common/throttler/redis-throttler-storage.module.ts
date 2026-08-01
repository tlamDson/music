import { Module } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Bọc storage thành provider thật thay vì `new` thẳng trong `useFactory` của
 * `ThrottlerModule.forRootAsync` — có vậy Nest mới sở hữu vòng đời của nó và
 * `onApplicationShutdown` (đóng kết nối Redis) mới được gọi.
 *
 * `ConfigModule` là global (`isGlobal: true` trong `AppModule`) nên không cần
 * import lại ở đây.
 */
@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class RedisThrottlerStorageModule {}
