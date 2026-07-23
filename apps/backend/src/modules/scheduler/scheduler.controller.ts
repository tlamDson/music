import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  SchedulerService,
  CreateScheduleSchema,
  CreateScheduleDto,
} from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtPayload } from '@cafe-music/shared';

@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORG_ADMIN')
export class SchedulerController {
  constructor(private schedulerService: SchedulerService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.schedulerService.findAll(user);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateScheduleSchema)) dto: CreateScheduleDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.schedulerService.create(dto, user);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.schedulerService.toggle(id, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.schedulerService.remove(id, user);
  }
}
