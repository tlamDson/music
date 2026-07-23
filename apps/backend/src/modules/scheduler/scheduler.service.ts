import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { z } from 'zod';
import { JwtPayload } from '@cafe-music/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';

export const CreateScheduleSchema = z.object({
  syncGroupId: z.string().min(1),
  playlistId: z.string().min(1),
  cronExpression: z.string().min(1),
  active: z.boolean().default(true),
});

export type CreateScheduleDto = z.infer<typeof CreateScheduleSchema>;

const SCHEDULE_INCLUDE = { syncGroup: true, playlist: true } as const;

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private syncService: SyncService,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────
  // Lịch không có organizationId riêng, org của nó nằm ở syncGroup — mọi truy
  // vấn phải lọc qua đó, nếu không org khác sửa/xoá được lịch của nhau.

  findAll(user: JwtPayload) {
    return this.prisma.playlistSchedule.findMany({
      where: { syncGroup: { organizationId: user.organizationId! } },
      include: SCHEDULE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateScheduleDto, user: JwtPayload) {
    const group = await this.prisma.syncGroup.findFirst({
      where: { id: dto.syncGroupId, organizationId: user.organizationId! },
    });
    if (!group) throw new NotFoundException('Sync group not found');

    const playlist = await this.prisma.playlist.findFirst({
      where: { id: dto.playlistId, organizationId: user.organizationId! },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');

    return this.prisma.playlistSchedule.create({
      data: dto,
      include: SCHEDULE_INCLUDE,
    });
  }

  async toggle(id: string, user: JwtPayload) {
    const schedule = await this.findOwned(id, user);

    return this.prisma.playlistSchedule.update({
      where: { id },
      data: { active: !schedule.active },
      include: SCHEDULE_INCLUDE,
    });
  }

  async remove(id: string, user: JwtPayload) {
    await this.findOwned(id, user);

    await this.prisma.playlistSchedule.delete({ where: { id } });
    return { message: 'Schedule deleted' };
  }

  private async findOwned(id: string, user: JwtPayload) {
    const schedule = await this.prisma.playlistSchedule.findFirst({
      where: { id, syncGroup: { organizationId: user.organizationId! } },
    });

    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async checkSchedules() {
    const now = new Date();
    const schedules = await this.prisma.playlistSchedule.findMany({
      where: { active: true },
      include: { syncGroup: true, playlist: true },
    });

    for (const schedule of schedules) {
      if (this.matchesCron(schedule.cronExpression, now)) {
        this.logger.log(
          `Auto-playing playlist "${schedule.playlist.name}" in group "${schedule.syncGroup.name}"`,
        );

        try {
          const systemPayload = {
            sub: 'system',
            email: 'system@cafe-music',
            role: 'ORG_ADMIN' as const,
            organizationId: schedule.syncGroup.organizationId,
            storeId: null,
          };

          await this.syncService.play(
            schedule.syncGroupId,
            { playlistId: schedule.playlistId, trackIndex: 0, mode: 'LOOSE' },
            systemPayload,
          );
        } catch (err) {
          this.logger.error(
            `Failed to auto-play schedule ${schedule.id}:`,
            err,
          );
        }
      }
    }
  }

  private matchesCron(expression: string, now: Date): boolean {
    try {
      const parts = expression.split(' ');
      if (parts.length < 5) return false;

      const [minutePart, hourPart] = parts;

      const matchMinute =
        minutePart === '*' || parseInt(minutePart) === now.getMinutes();
      const matchHour =
        hourPart === '*' || parseInt(hourPart) === now.getHours();

      return matchMinute && matchHour;
    } catch (error) {
      // Cron sai cú pháp khiến lịch không bao giờ chạy — im lặng thì không ai biết
      this.logger.warn(
        `Invalid cron expression "${expression}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
