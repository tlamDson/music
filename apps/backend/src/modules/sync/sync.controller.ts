import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StorePlaySchema, JwtPayload } from '@cafe-music/shared';
import { z } from 'zod';

/**
 * Chỉ còn luồng phát theo quán — tầng `/sync/groups/*` đã bị bỏ cùng SyncGroup.
 */
@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Get('overview')
  @Roles('ORG_ADMIN')
  overview(@CurrentUser() user: JwtPayload) {
    return this.syncService.overview(user);
  }

  @Post('stores/:id/play')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  playStore(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(StorePlaySchema))
    dto: z.infer<typeof StorePlaySchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.syncService.playStore(id, dto, user);
  }

  @Post('stores/:id/pause')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  pauseStore(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.pauseStore(id, user);
  }

  @Post('stores/:id/resume')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  resumeStore(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.resumeStore(id, user);
  }

  @Post('stores/:id/next')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  nextStore(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.nextStore(id, user);
  }

  @Post('stores/:id/stop')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  stopStore(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.stopStoreFor(id, user);
  }

  @Get('stores/:id/playback')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  storePlayback(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.getStorePlayback(id, user);
  }

  // Client mở trang giữa chừng vẫn dựng được thanh phát: broadcast WS không
  // replay khi join room, thiếu cái này thì trang trắng tới lần chuyển bài kế.
  @Get('stores/:id/now-playing')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  storeNowPlaying(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.nowPlayingForStore(id, user);
  }

  @Post('clock')
  clock() {
    return { serverTs: Date.now() };
  }
}
