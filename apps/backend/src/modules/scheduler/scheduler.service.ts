import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncService } from '../sync/sync.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private syncService: SyncService,
  ) {}

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
          this.logger.error(`Failed to auto-play schedule ${schedule.id}:`, err);
        }
      }
    }
  }

  private matchesCron(expression: string, now: Date): boolean {
    try {
      const parts = expression.split(' ');
      if (parts.length < 5) return false;

      const [minutePart, hourPart] = parts;

      const matchMinute = minutePart === '*' || parseInt(minutePart) === now.getMinutes();
      const matchHour = hourPart === '*' || parseInt(hourPart) === now.getHours();

      return matchMinute && matchHour;
    } catch {
      return false;
    }
  }
}
