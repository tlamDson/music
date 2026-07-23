import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  PlayGroupSchema,
  OverrideSchema,
  StorePlaySchema,
  CreateSyncGroupSchema,
  JwtPayload,
} from '@cafe-music/shared';
import { z } from 'zod';

@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Get('groups')
  listGroups(@CurrentUser() user: JwtPayload) {
    return this.syncService.listGroups(user);
  }

  @Post('groups')
  @Roles('ORG_ADMIN')
  createGroup(
    @Body(new ZodValidationPipe(CreateSyncGroupSchema))
    dto: z.infer<typeof CreateSyncGroupSchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.syncService.createGroup(dto, user);
  }

  @Post('groups/:id/play')
  @Roles('ORG_ADMIN')
  play(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(PlayGroupSchema))
    dto: z.infer<typeof PlayGroupSchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.syncService.play(id, dto, user);
  }

  @Post('groups/:id/pause')
  @Roles('ORG_ADMIN')
  pause(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.pause(id, user);
  }

  @Post('groups/:id/skip')
  @Roles('ORG_ADMIN')
  skip(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.skip(id, user);
  }

  @Get('groups/:id/state')
  getState(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.getGroupState(id, user);
  }

  // Phát nhạc riêng của quán — quán tự tách khỏi nhóm sync khi bấm phát
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

  @Get('stores/:id/playback')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  storePlayback(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.getStorePlayback(id, user);
  }

  @Post('stores/:id/override')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  override(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(OverrideSchema))
    dto: z.infer<typeof OverrideSchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.syncService.override(id, dto, user);
  }

  @Post('stores/:id/rejoin')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  rejoin(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.rejoin(id, user);
  }

  @Post('clock')
  clock() {
    return { serverTs: Date.now() };
  }
}
