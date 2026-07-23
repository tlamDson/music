import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from './redis.service';
import { SyncGateway } from './sync.gateway';
import { S3Service } from '../tracks/s3.service';
import {
  JwtPayload,
  PlayGroupDto,
  OverrideDto,
  SyncGroupState,
} from '@cafe-music/shared';

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private gateway: SyncGateway,
    private s3: S3Service,
  ) {}

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

    return state;
  }

  async pause(groupId: string, user: JwtPayload) {
    const group = await this.prisma.syncGroup.findFirst({
      where: { id: groupId, organizationId: user.organizationId! },
    });
    if (!group) throw new NotFoundException('Sync group not found');

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
