import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { SchedulerService } from '../../src/modules/scheduler/scheduler.service';
import { SyncService } from '../../src/modules/sync/sync.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let prisma: DeepMockProxy<PrismaClient>;
  let syncService: jest.Mocked<SyncService>;

  const buildSchedule = (overrides: Record<string, unknown> = {}) => ({
    id: 'schedule-1',
    cronExpression: '30 10 * * *',
    playlistId: 'playlist-1',
    syncGroupId: 'group-1',
    active: true,
    playlist: { id: 'playlist-1', name: 'Morning Chill' },
    syncGroup: { id: 'group-1', name: 'Group A', organizationId: 'org-1' },
    ...overrides,
  });

  beforeEach(async () => {
    // Pin "now" at 10:30 local time — matchesCron reads getMinutes()/getHours()
    jest.useFakeTimers({ now: new Date(2026, 0, 1, 10, 30) });
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const prismaMock = mockDeep<PrismaClient>();
    const syncMock = {
      play: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SyncService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SyncService, useValue: syncMock },
      ],
    }).compile();

    service = module.get(SchedulerService);
    prisma = module.get(PrismaService);
    syncService = module.get(SyncService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('should fetch only active schedules with playlist and sync group included', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([]);

    await service.checkSchedules();

    expect(prisma.playlistSchedule.findMany).toHaveBeenCalledWith({
      where: { active: true },
      include: { syncGroup: true, playlist: true },
    });
    expect(syncService.play).not.toHaveBeenCalled();
  });

  it('should play the schedule when cron minute and hour match now', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule(),
    ] as any);

    await service.checkSchedules();

    expect(syncService.play).toHaveBeenCalledTimes(1);
  });

  it('should play when cron is a full wildcard', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule({ cronExpression: '* * * * *' }),
    ] as any);

    await service.checkSchedules();

    expect(syncService.play).toHaveBeenCalledTimes(1);
  });

  it('should not play when cron hour does not match', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule({ cronExpression: '0 9 * * *' }),
    ] as any);

    await service.checkSchedules();

    expect(syncService.play).not.toHaveBeenCalled();
  });

  it('should pass playlist, track index, mode and system payload to sync play', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule(),
    ] as any);

    await service.checkSchedules();

    expect(syncService.play).toHaveBeenCalledWith(
      'group-1',
      { playlistId: 'playlist-1', trackIndex: 0, mode: 'LOOSE' },
      {
        sub: 'system',
        email: 'system@cafe-music',
        role: 'ORG_ADMIN',
        organizationId: 'org-1',
        storeId: null,
      },
    );
  });

  it('should skip malformed cron expressions without throwing', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule({ cronExpression: '30 10' }),
    ] as any);

    await expect(service.checkSchedules()).resolves.toBeUndefined();
    expect(syncService.play).not.toHaveBeenCalled();
  });

  it('should log the error and continue with remaining schedules when play fails', async () => {
    const failing = buildSchedule({ id: 'schedule-1' });
    const succeeding = buildSchedule({
      id: 'schedule-2',
      syncGroupId: 'group-2',
    });
    prisma.playlistSchedule.findMany.mockResolvedValue([
      failing,
      succeeding,
    ] as any);
    syncService.play
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValueOnce(undefined as never);

    await expect(service.checkSchedules()).resolves.toBeUndefined();

    expect(syncService.play).toHaveBeenCalledTimes(2);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('schedule-1'),
      expect.any(Error),
    );
  });
});
