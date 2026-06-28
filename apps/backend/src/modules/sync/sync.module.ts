import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SyncService } from './sync.service';
import { SyncGateway } from './sync.gateway';
import { SyncController } from './sync.controller';
import { RedisService } from './redis.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [SyncService, SyncGateway, RedisService],
  controllers: [SyncController],
  exports: [SyncService, RedisService],
})
export class SyncModule {}
