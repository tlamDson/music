import { Test, TestingModule } from '@nestjs/testing';
import { Logger, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { JwtPayload } from '@cafe-music/shared';
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
    storeId: 'store-1',
    active: true,
    playlist: { id: 'playlist-1', name: 'Morning Chill' },
    store: { id: 'store-1', name: 'Quán Nguyễn Huệ', organizationId: 'org-1' },
    ...overrides,
  });

  beforeEach(async () => {
    // Pin "now" at 10:30 local time — matchesCron reads getMinutes()/getHours()
    jest.useFakeTimers({ now: new Date(2026, 0, 1, 10, 30) });
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const prismaMock = mockDeep<PrismaClient>();
    const syncMock = {
      playStore: jest.fn().mockResolvedValue(undefined),
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
      include: { store: true, playlist: true },
    });
    expect(syncService.playStore).not.toHaveBeenCalled();
  });

  it('should play the schedule when cron minute and hour match now', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule(),
    ] as any);

    await service.checkSchedules();

    expect(syncService.playStore).toHaveBeenCalledTimes(1);
  });

  it('should play when cron is a full wildcard', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule({ cronExpression: '* * * * *' }),
    ] as any);

    await service.checkSchedules();

    expect(syncService.playStore).toHaveBeenCalledTimes(1);
  });

  it('should not play when cron hour does not match', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule({ cronExpression: '0 9 * * *' }),
    ] as any);

    await service.checkSchedules();

    expect(syncService.playStore).not.toHaveBeenCalled();
  });

  it('should pass playlist, track index and system payload to store playback', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule(),
    ] as any);

    await service.checkSchedules();

    expect(syncService.playStore).toHaveBeenCalledWith(
      'store-1',
      { playlistId: 'playlist-1', trackIndex: 0 },
      {
        sub: 'system',
        email: 'system@cafe-music',
        role: 'ORG_ADMIN',
        organizationId: 'org-1',
        storeId: 'store-1',
      },
    );
  });

  it('should skip malformed cron expressions without throwing', async () => {
    prisma.playlistSchedule.findMany.mockResolvedValue([
      buildSchedule({ cronExpression: '30 10' }),
    ] as any);

    await expect(service.checkSchedules()).resolves.toBeUndefined();
    expect(syncService.playStore).not.toHaveBeenCalled();
  });

  it('should log the error and continue with remaining schedules when play fails', async () => {
    const failing = buildSchedule({ id: 'schedule-1' });
    const succeeding = buildSchedule({
      id: 'schedule-2',
      storeId: 'store-2',
    });
    prisma.playlistSchedule.findMany.mockResolvedValue([
      failing,
      succeeding,
    ] as any);
    syncService.playStore
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValueOnce(undefined as never);

    await expect(service.checkSchedules()).resolves.toBeUndefined();

    expect(syncService.playStore).toHaveBeenCalledTimes(2);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('schedule-1'),
      expect.any(Error),
    );
  });

  // CRUD từng nằm thẳng trong controller: không kiểm tra org nên org khác
  // toggle/xoá được lịch của nhau, và toggle ghi `active: { set: undefined }`
  // nên không đổi gì cả.
  describe('CRUD', () => {
    const user: JwtPayload = {
      sub: 'user-1',
      email: 'admin@cafe.com',
      role: 'ORG_ADMIN',
      organizationId: 'org-1',
      storeId: null,
    };

    const createDto = {
      storeId: 'store-1',
      playlistId: 'playlist-1',
      cronExpression: '30 10 * * *',
      active: true,
    };

    it('lists only schedules of the caller organization', async () => {
      prisma.playlistSchedule.findMany.mockResolvedValue([]);

      await service.findAll(user);

      expect(prisma.playlistSchedule.findMany).toHaveBeenCalledWith({
        where: { store: { organizationId: 'org-1' } },
        include: { store: true, playlist: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('creates a schedule when group and playlist belong to the organization', async () => {
      prisma.store.findFirst.mockResolvedValue({ id: 'store-1' } as never);
      prisma.playlist.findFirst.mockResolvedValue({
        id: 'playlist-1',
      } as never);
      prisma.playlistSchedule.create.mockResolvedValue(
        buildSchedule() as never,
      );

      await service.create(createDto, user);

      expect(prisma.playlistSchedule.create).toHaveBeenCalledWith({
        data: createDto,
        include: { store: true, playlist: true },
      });
    });

    it('refuses to create a schedule for a sync group outside the organization', async () => {
      prisma.store.findFirst.mockResolvedValue(null);

      await expect(service.create(createDto, user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.playlistSchedule.create).not.toHaveBeenCalled();
    });

    it('refuses to create a schedule for a playlist outside the organization', async () => {
      prisma.store.findFirst.mockResolvedValue({ id: 'store-1' } as never);
      prisma.playlist.findFirst.mockResolvedValue(null);

      await expect(service.create(createDto, user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.playlistSchedule.create).not.toHaveBeenCalled();
    });

    it('turns an active schedule off when toggling', async () => {
      prisma.playlistSchedule.findFirst.mockResolvedValue(
        buildSchedule({ active: true }) as never,
      );
      prisma.playlistSchedule.update.mockResolvedValue(
        buildSchedule({ active: false }) as never,
      );

      await service.toggle('schedule-1', user);

      expect(prisma.playlistSchedule.update).toHaveBeenCalledWith({
        where: { id: 'schedule-1' },
        data: { active: false },
        include: { store: true, playlist: true },
      });
    });

    it('turns a paused schedule back on when toggling', async () => {
      prisma.playlistSchedule.findFirst.mockResolvedValue(
        buildSchedule({ active: false }) as never,
      );
      prisma.playlistSchedule.update.mockResolvedValue(
        buildSchedule({ active: true }) as never,
      );

      await service.toggle('schedule-1', user);

      expect(prisma.playlistSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { active: true } }),
      );
    });

    it('scopes the toggle lookup to the caller organization', async () => {
      prisma.playlistSchedule.findFirst.mockResolvedValue(
        buildSchedule() as never,
      );
      prisma.playlistSchedule.update.mockResolvedValue(
        buildSchedule() as never,
      );

      await service.toggle('schedule-1', user);

      expect(prisma.playlistSchedule.findFirst).toHaveBeenCalledWith({
        where: { id: 'schedule-1', store: { organizationId: 'org-1' } },
      });
    });

    it('refuses to toggle a schedule from another organization', async () => {
      prisma.playlistSchedule.findFirst.mockResolvedValue(null);

      await expect(service.toggle('schedule-1', user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.playlistSchedule.update).not.toHaveBeenCalled();
    });

    it('deletes a schedule of the caller organization', async () => {
      prisma.playlistSchedule.findFirst.mockResolvedValue(
        buildSchedule() as never,
      );
      prisma.playlistSchedule.delete.mockResolvedValue(
        buildSchedule() as never,
      );

      await expect(service.remove('schedule-1', user)).resolves.toEqual({
        message: 'Schedule deleted',
      });
      expect(prisma.playlistSchedule.delete).toHaveBeenCalledWith({
        where: { id: 'schedule-1' },
      });
    });

    it('refuses to delete a schedule from another organization', async () => {
      prisma.playlistSchedule.findFirst.mockResolvedValue(null);

      await expect(service.remove('schedule-1', user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.playlistSchedule.delete).not.toHaveBeenCalled();
    });
  });
});
