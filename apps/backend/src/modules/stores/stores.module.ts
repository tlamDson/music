import { Module } from '@nestjs/common';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { SyncModule } from '../sync/sync.module';

@Module({
  // Chi tiết quán trả kèm "đang phát gì" + số màn hình đang kết nối, nên cần
  // SyncService/SyncGateway.
  imports: [SyncModule],
  providers: [StoresService],
  controllers: [StoresController],
  exports: [StoresService],
})
export class StoresModule {}
