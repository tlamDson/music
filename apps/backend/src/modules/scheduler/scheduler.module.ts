import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [ScheduleModule.forRoot(), SyncModule],
  providers: [SchedulerService],
  controllers: [SchedulerController],
})
export class SchedulerModule {}
