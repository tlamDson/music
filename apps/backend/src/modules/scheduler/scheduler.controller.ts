import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtPayload } from '@cafe-music/shared';
import { z } from 'zod';

const CreateScheduleSchema = z.object({
  syncGroupId: z.string().uuid(),
  playlistId: z.string().uuid(),
  cronExpression: z.string().min(1),
  active: z.boolean().default(true),
});

@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ORG_ADMIN')
export class SchedulerController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.prisma.playlistSchedule.findMany({
      where: {
        syncGroup: { organizationId: user.organizationId! },
      },
      include: { syncGroup: true, playlist: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(CreateScheduleSchema))
    dto: z.infer<typeof CreateScheduleSchema>,
    @CurrentUser() _user: JwtPayload,
  ) {
    return this.prisma.playlistSchedule.create({
      data: dto,
      include: { syncGroup: true, playlist: true },
    });
  }

  @Patch(':id/toggle')
  toggle(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.playlistSchedule.update({
      where: { id },
      data: { active: { set: undefined } },
    });
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.playlistSchedule.delete({ where: { id } });
  }
}
