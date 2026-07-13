import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { StoresService } from './stores.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CreateStoreSchema,
  UpdateStoreSchema,
  JwtPayload,
} from '@cafe-music/shared';
import { z } from 'zod';

const AssignGroupSchema = z.object({ syncGroupId: z.string().uuid() });

@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoresController {
  constructor(private storesService: StoresService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.storesService.findAll(user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storesService.findOne(id, user);
  }

  @Post()
  @Roles('ORG_ADMIN')
  create(
    @Body(new ZodValidationPipe(CreateStoreSchema))
    dto: z.infer<typeof CreateStoreSchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storesService.create(dto, user);
  }

  @Patch(':id')
  @Roles('ORG_ADMIN')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStoreSchema))
    dto: z.infer<typeof UpdateStoreSchema>,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storesService.update(id, dto, user);
  }

  @Post(':id/assign-group')
  @Roles('ORG_ADMIN')
  assignGroup(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AssignGroupSchema))
    body: { syncGroupId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storesService.assignGroup(id, body.syncGroupId, user);
  }

  @Get(':id/status')
  getStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.storesService.getStatus(id, user);
  }
}
