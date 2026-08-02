import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MeController } from './me.controller';
import { RedisThrottlerStorageModule } from '../../common/throttler/redis-throttler-storage.module';

@Module({
  imports: [RedisThrottlerStorageModule],
  providers: [UsersService],
  controllers: [UsersController, MeController],
  exports: [UsersService],
})
export class UsersModule {}
