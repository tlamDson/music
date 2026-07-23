import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from './redis.service';
import { SyncGateway } from './sync.gateway';
import { S3Service } from '../tracks/s3.service';
import {
  JwtPayload,
  PlayGroupDto,
  OverrideDto,
  CreateSyncGroupDto,
  SyncGroupState,
} from '@cafe-music/shared';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  /**
   * Hẹn giờ chuyển bài của từng nhóm. Nằm trong bộ nhớ nên chỉ đúng khi chạy
   * một instance backend (Railway hiện tại); scale nhiều instance thì phải
   * chuyển sang khoá phân tán trên Redis, nếu không mỗi instance sẽ tự chuyển
   * bài một lần.
   */
  private readonly advanceTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private gateway: SyncGateway,
    private s3: S3Service,
  ) {}

  /** Timer mất khi process restart — dựng lại theo thời lượng còn lại. */
  async onModuleInit() {
    const groups = await this.prisma.syncGroup.findMany({
      where: { status: 'PLAYING' },
    });

    for (const group of groups) {
      const state = await this.redis.getGroupState(group.id);
      if (!state?.isPlaying || !state.trackId || !state.startedAtServerTs) {
        continue;
      }

      const track = await this.prisma.track.findFirst({
        where: { id: state.trackId },
      });
      if (!track?.durationMs) continue;

      const elapsedMs =
        Date.now() - state.startedAtServerTs + (state.positionMs ?? 0);
      const remainingMs = track.durationMs - elapsedMs;

      if (remainingMs > 0) {
        this.scheduleAdvance(group.id, remainingMs);
      } else {
        void this.advance(group.id);
      }
    }
  }

  private clearAdvance(groupId: string) {
    const timer = this.advanceTimers.get(groupId);
    if (!timer) return;

    clearTimeout(timer);
    this.advanceTimers.delete(groupId);
  }

  private scheduleAdvance(groupId: string, delayMs: number) {
    this.clearAdvance(groupId);
    if (delayMs <= 0) return;

    this.advanceTimers.set(
      groupId,
      setTimeout(() => {
        void this.advance(groupId).catch((err: unknown) =>
          this.logger.error(
            `Auto-next failed for group ${groupId}`,
            err instanceof Error ? err.stack : String(err),
          ),
        );
      }, delayMs),
    );
  }

  /** Hết bài: sang bài kế, hoặc dừng hẳn nếu đã là bài cuối playlist. */
  private async advance(groupId: string) {
    const state = await this.redis.getGroupState(groupId);
    if (!state?.playlistId || !state.isPlaying) return;

    const group = await this.prisma.syncGroup.findFirst({
      where: { id: groupId },
    });
    if (!group) return;

    const playlist = await this.prisma.playlist.findFirst({
      where: { id: state.playlistId },
      include: { playlistTracks: { orderBy: { position: 'asc' } } },
    });
    if (!playlist) return;

    const nextIndex = state.trackIndex + 1;
    if (nextIndex >= playlist.playlistTracks.length) {
      await this.stopGroup(groupId);
      return;
    }

    // Chạy nền, không có request nào phía sau → dựng payload hệ thống theo org
    // của chính nhóm (giống SchedulerService).
    await this.play(
      groupId,
      { playlistId: state.playlistId, trackIndex: nextIndex, mode: state.mode },
      {
        sub: 'system',
        email: 'system@cafe-music',
        role: 'ORG_ADMIN',
        organizationId: group.organizationId,
        storeId: null,
      },
    );
  }

  private async stopGroup(groupId: string) {
    this.clearAdvance(groupId);

    const state = await this.redis.getGroupState(groupId);
    if (state) {
      await this.redis.setGroupState(groupId, {
        ...state,
        isPlaying: false,
        status: 'STOPPED',
      });
    }

    await this.prisma.syncGroup.update({
      where: { id: groupId },
      data: { status: 'STOPPED' },
    });

    this.gateway.broadcastToGroup(groupId, 'stopped', {
      groupId,
      serverTs: Date.now(),
    });
  }

  /**
   * Không có endpoint liệt kê group thì web buộc phải hardcode id
   * ('sync-group-main') — hỏng ngay khi chuỗi có nhóm thứ hai.
   */
  async listGroups(user: JwtPayload) {
    const groups = await this.prisma.syncGroup.findMany({
      where: { organizationId: user.organizationId! },
      include: { _count: { select: { stores: true } } },
      orderBy: { name: 'asc' },
    });

    return { data: groups };
  }

  async createGroup(dto: CreateSyncGroupDto, user: JwtPayload) {
    return this.prisma.syncGroup.create({
      data: {
        name: dto.name,
        mode: dto.mode ?? 'LOOSE',
        organizationId: user.organizationId!,
      },
    });
  }

  async play(groupId: string, dto: PlayGroupDto, user: JwtPayload) {
    const group = await this.prisma.syncGroup.findFirst({
      where: { id: groupId, organizationId: user.organizationId! },
    });
    if (!group) throw new NotFoundException('Sync group not found');

    const playlist = await this.prisma.playlist.findFirst({
      where: { id: dto.playlistId, organizationId: user.organizationId! },
      include: {
        playlistTracks: {
          orderBy: { position: 'asc' },
          include: { track: true },
        },
      },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');

    const trackEntry = playlist.playlistTracks[dto.trackIndex ?? 0];
    if (!trackEntry)
      throw new NotFoundException('Track not found at given index');

    // Presign URL để player load được audio trực tiếp từ S3/MinIO
    const trackUrl = trackEntry.track.s3Key
      ? await this.s3.getPresignedUrl(trackEntry.track.s3Key)
      : null;

    const serverTs = Date.now();
    const state: SyncGroupState = {
      groupId,
      playlistId: dto.playlistId,
      trackId: trackEntry.trackId,
      trackIndex: dto.trackIndex ?? 0,
      positionMs: 0,
      startedAtServerTs: serverTs,
      isPlaying: true,
      mode: dto.mode ?? 'LOOSE',
      status: 'PLAYING',
    };

    await this.redis.setGroupState(groupId, state);

    await this.prisma.syncGroup.update({
      where: { id: groupId },
      data: {
        status: 'PLAYING',
        currentTrackId: trackEntry.trackId,
        trackIndex: dto.trackIndex ?? 0,
        startedAtTs: BigInt(serverTs),
        mode: dto.mode ?? 'LOOSE',
      },
    });

    this.gateway.broadcastToGroup(groupId, 'now-playing', {
      groupId,
      trackId: trackEntry.trackId,
      trackUrl,
      positionMs: 0,
      serverTs,
      mode: state.mode,
    });

    // Track upload trước khi web đo thời lượng có durationMs = 0 → không biết
    // bao giờ hết bài, đành để nhóm dừng ở đó thay vì đoán bừa.
    if (trackEntry.track.durationMs > 0) {
      this.scheduleAdvance(groupId, trackEntry.track.durationMs);
    } else {
      this.clearAdvance(groupId);
      this.logger.warn(
        `Track ${trackEntry.trackId} has no duration — auto-next disabled for group ${groupId}`,
      );
    }

    return state;
  }

  async pause(groupId: string, user: JwtPayload) {
    const group = await this.prisma.syncGroup.findFirst({
      where: { id: groupId, organizationId: user.organizationId! },
    });
    if (!group) throw new NotFoundException('Sync group not found');

    // Không huỷ thì timer vẫn nổ và nhóm tự phát tiếp dù đang tạm dừng
    this.clearAdvance(groupId);

    const state = await this.redis.getGroupState(groupId);
    if (state) {
      const pausedState = {
        ...state,
        isPlaying: false,
        status: 'PAUSED' as const,
      };
      await this.redis.setGroupState(groupId, pausedState);
    }

    await this.prisma.syncGroup.update({
      where: { id: groupId },
      data: { status: 'PAUSED' },
    });
    this.gateway.broadcastToGroup(groupId, 'paused', {
      groupId,
      serverTs: Date.now(),
    });
    return { groupId, status: 'PAUSED' };
  }

  async skip(groupId: string, user: JwtPayload) {
    const group = await this.prisma.syncGroup.findFirst({
      where: { id: groupId, organizationId: user.organizationId! },
    });
    if (!group) throw new NotFoundException('Sync group not found');

    const state = await this.redis.getGroupState(groupId);
    if (!state?.playlistId)
      throw new NotFoundException('No active playlist in group');

    const playlist = await this.prisma.playlist.findFirst({
      where: { id: state.playlistId },
      include: { playlistTracks: { orderBy: { position: 'asc' } } },
    });
    if (!playlist) throw new NotFoundException('Playlist not found');

    const nextIndex = (state.trackIndex + 1) % playlist.playlistTracks.length;

    return this.play(
      groupId,
      { playlistId: state.playlistId, trackIndex: nextIndex, mode: state.mode },
      user,
    );
  }

  /**
   * RolesGuard chỉ chứng minh "người gọi là STORE_ADMIN", không nói gì về việc
   * đó là store admin của quán nào — thiếu bước này thì quán A điều khiển được
   * quán B. Store ngoài org trả 404 để không lộ sự tồn tại.
   */
  private async assertStoreAccess(storeId: string, user: JwtPayload) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, organizationId: user.organizationId! },
    });
    if (!store) throw new NotFoundException('Store not found');

    if (user.role === 'STORE_ADMIN' && user.storeId !== storeId) {
      throw new ForbiddenException(
        'Store admins can only control their own store',
      );
    }

    return store;
  }

  async override(storeId: string, dto: OverrideDto, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

    const overrideData = {
      storeId,
      isOverridden: true,
      overrideTrackId: dto.trackId ?? null,
      overridePlaylistId: dto.playlistId ?? null,
      overriddenAt: new Date().toISOString(),
    };

    await this.redis.setStoreOverride(storeId, overrideData);

    await this.prisma.storeOverride.upsert({
      where: { storeId },
      update: {
        isOverridden: true,
        overrideTrackId: dto.trackId ?? null,
        overridePlaylistId: dto.playlistId ?? null,
        overriddenAt: new Date(),
      },
      create: {
        storeId,
        isOverridden: true,
        overrideTrackId: dto.trackId ?? null,
        overridePlaylistId: dto.playlistId ?? null,
        overriddenAt: new Date(),
      },
    });

    return overrideData;
  }

  async rejoin(storeId: string, user: JwtPayload) {
    const store = await this.assertStoreAccess(storeId, user);

    await this.redis.clearStoreOverride(storeId);

    await this.prisma.storeOverride.upsert({
      where: { storeId },
      update: { isOverridden: false, rejoinedAt: new Date() },
      create: { storeId, isOverridden: false },
    });

    if (store.syncGroupId) {
      const state = await this.redis.getGroupState(store.syncGroupId);
      return { rejoined: true, state };
    }

    return { rejoined: true, state: null };
  }

  async getGroupState(groupId: string, user: JwtPayload) {
    const group = await this.prisma.syncGroup.findFirst({
      where: { id: groupId, organizationId: user.organizationId! },
    });
    if (!group) throw new NotFoundException('Sync group not found');

    return this.redis.getGroupState(groupId);
  }
}
