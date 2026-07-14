import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SyncService } from './sync.service';
import { SyncGateway } from './sync.gateway';
import { SyncController } from './sync.controller';
import { RedisService } from './redis.service';
import { TracksModule } from '../tracks/tracks.module';

@Module({
  imports: [JwtModule.register({}), TracksModule],
  providers: [SyncService, SyncGateway, RedisService],
  controllers: [SyncController],
  exports: [SyncService, RedisService],
})
export class SyncModule {}
