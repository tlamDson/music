import { Module } from '@nestjs/common';
import { TracksService } from './tracks.service';
import { TracksController } from './tracks.controller';
import { S3Service } from './s3.service';

@Module({
  providers: [TracksService, S3Service],
  controllers: [TracksController],
  exports: [TracksService, S3Service],
})
export class TracksModule {}
