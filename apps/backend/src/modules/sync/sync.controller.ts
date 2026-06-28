import { Controller, Post, Get, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlayGroupSchema, OverrideSchema, JwtPayload } from '@cafe-music/shared';
import { z } from 'zod';

@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post('groups/:id/play')
  @Roles('ORG_ADMIN')
  play(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PlayGroupSchema)) dto: z.infer<typeof PlayGroupSchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.syncService.play(id, dto, user);
  }

  @Post('groups/:id/pause')
  @Roles('ORG_ADMIN')
  pause(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.pause(id, user);
  }

  @Post('groups/:id/skip')
  @Roles('ORG_ADMIN')
  skip(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.skip(id, user);
  }

  @Get('groups/:id/state')
  getState(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.getGroupState(id, user);
  }

  @Post('stores/:id/override')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  override(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(OverrideSchema)) dto: z.infer<typeof OverrideSchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.syncService.override(id, dto, user);
  }

  @Post('stores/:id/rejoin')
  @Roles('ORG_ADMIN', 'STORE_ADMIN')
  rejoin(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.syncService.rejoin(id, user);
  }

  @Post('clock')
  clock() {
    return { serverTs: Date.now() };
  }
}
