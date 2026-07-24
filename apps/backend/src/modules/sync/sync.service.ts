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
  StorePlayDto,
  CreateSyncGroupDto,
  SyncGroupState,
  StorePlaybackState,
  NowPlayingSnapshot,
  WsTrackMeta,
} from '@cafe-music/shared';

/** Chỉ phần client cần để dựng thanh phát — không đẩy cả bản ghi Track ra WS. */
type TrackRow = {
  id: string;
  title: string;
  artist: string | null;
  durationMs: number;
  s3Key: string | null;
};

function toTrackMeta(track: TrackRow): WsTrackMeta {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    durationMs: track.durationMs,
  };
}

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

  /**
   * Một chỗ để admin nhìn ra quán nào đang nghe theo chuỗi, quán nào tách ra
   * phát nhạc riêng và còn mấy bài nữa thì quay lại.
   */
  async overview(user: JwtPayload) {
    const stores = await this.prisma.store.findMany({
      where: { organizationId: user.organizationId! },
      include: { storeOverride: true, syncGroup: true },
      orderBy: { name: 'asc' },
    });

    const data = await Promise.all(
      stores.map(async (store) => {
        const playback = await this.redis.getStorePlayback(store.id);
        const groupState = store.syncGroupId
          ? await this.redis.getGroupState(store.syncGroupId)
          : null;

        // Hàng chờ riêng trong Redis là nguồn tin cậy nhất; cờ trong DB chỉ là
        // bản lưu để sống sót qua restart.
        const isOverridden =
          Boolean(playback) || Boolean(store.storeOverride?.isOverridden);

        return {
          storeId: store.id,
          name: store.name,
          syncGroupId: store.syncGroupId,
          syncGroupName: store.syncGroup?.name ?? null,
          isOverridden,
          trackId: playback
            ? (playback.trackIds[playback.trackIndex] ?? null)
            : (groupState?.trackId ?? null),
          isPlaying: playback
            ? playback.isPlaying
            : (groupState?.isPlaying ?? false),
          queueRemaining: playback
            ? playback.trackIds.length - playback.trackIndex - 1
            : null,
        };
      }),
    );

    return { data };
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

    // Bấm Play cho nhóm coi như mọi quán trong nhóm rejoin — nếu không, quán
    // từng tách ra (hoặc còn override rác từ phiên trước, TTL 24h) sẽ mãi hiện
    // "Overriding" ở /dashboard/stores dù đang nghe đúng nhạc của nhóm.
    await this.clearGroupStoreOverrides(groupId);

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
      track: toTrackMeta(trackEntry.track),
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
      // Gộp elapsed vào positionMs như pauseStore() đã làm — nếu không,
      // elapsedPositionMs() đọc lại lúc đang tạm dừng sẽ trả positionMs cũ
      // (thường là 0) thay vì đúng giây vừa dừng.
      const pausedState = {
        ...state,
        positionMs: elapsedPositionMs(state),
        startedAtServerTs: null,
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

  // ── Phát nhạc riêng của quán ─────────────────────────────────────────────
  // Quán tách khỏi nhóm sync (override) và phát playlist của mình. Nhạc đi qua
  // room `store:<id>` chứ không qua room của nhóm, nên không ảnh hưởng quán khác.

  async playStore(storeId: string, dto: StorePlayDto, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

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
    if (playlist.playlistTracks.length === 0) {
      throw new NotFoundException('Playlist has no tracks');
    }

    const trackIds = playlist.playlistTracks.map((pt) => pt.trackId);
    const trackIndex = dto.trackIndex ?? 0;
    const entry = playlist.playlistTracks[trackIndex];
    if (!entry) throw new NotFoundException('Track not found at given index');

    // Tách khỏi nhóm trước khi phát, nếu không broadcast của admin vẫn ghi đè
    await this.override(storeId, { playlistId: dto.playlistId }, user);

    return this.startStoreTrack({
      storeId,
      playlistId: dto.playlistId,
      trackIds,
      trackIndex,
      positionMs: 0,
      returnToGroupOnFinish: dto.returnToGroupOnFinish ?? true,
      track: entry.track,
    });
  }

  async pauseStore(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) throw new NotFoundException('Store is not playing locally');

    const positionMs = playback.isPlaying
      ? playback.positionMs + (Date.now() - playback.startedAtServerTs)
      : playback.positionMs;

    const paused = { ...playback, isPlaying: false, positionMs };
    await this.redis.setStorePlayback(storeId, paused);

    this.gateway.broadcastToStore(storeId, 'store-paused', {
      storeId,
      serverTs: Date.now(),
    });

    return paused;
  }

  async resumeStore(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) throw new NotFoundException('Store is not playing locally');

    const track = await this.prisma.track.findFirst({
      where: { id: playback.trackIds[playback.trackIndex] },
    });
    if (!track) throw new NotFoundException('Track not found');

    return this.startStoreTrack({ ...playback, track });
  }

  /** Hết bài trong hàng chờ riêng → bài kế, hết hàng chờ thì dọn state. */
  async nextStore(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) throw new NotFoundException('Store is not playing locally');

    const nextIndex = playback.trackIndex + 1;
    if (nextIndex >= playback.trackIds.length) {
      // Hết hàng chờ riêng: mặc định quán quay lại dòng sync của admin, bắt
      // đúng bài đang phát chứ không phát lại từ đầu.
      if (playback.returnToGroupOnFinish) {
        const { state } = await this.rejoin(storeId, user);
        return { finished: true, rejoined: true, playback: null, state };
      }

      await this.redis.clearStorePlayback(storeId);
      this.gateway.broadcastToStore(storeId, 'store-stopped', {
        storeId,
        serverTs: Date.now(),
      });
      return { finished: true, rejoined: false, playback: null };
    }

    const trackId = playback.trackIds[nextIndex];
    const track = await this.prisma.track.findFirst({ where: { id: trackId } });
    if (!track) throw new NotFoundException('Track not found');

    const next = await this.startStoreTrack({
      ...playback,
      trackIndex: nextIndex,
      positionMs: 0,
      track,
    });

    return { finished: false, rejoined: false, playback: next };
  }

  async getStorePlayback(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);
    return this.redis.getStorePlayback(storeId);
  }

  /** Lưu state + presign + broadcast — dùng chung cho play/resume/next. */
  private async startStoreTrack(params: {
    storeId: string;
    playlistId: string;
    trackIds: string[];
    trackIndex: number;
    positionMs: number;
    returnToGroupOnFinish: boolean;
    track: TrackRow;
  }): Promise<StorePlaybackState> {
    const serverTs = Date.now();
    const playback: StorePlaybackState = {
      storeId: params.storeId,
      playlistId: params.playlistId,
      trackIds: params.trackIds,
      trackIndex: params.trackIndex,
      positionMs: params.positionMs,
      startedAtServerTs: serverTs,
      isPlaying: true,
      returnToGroupOnFinish: params.returnToGroupOnFinish,
    };

    await this.redis.setStorePlayback(params.storeId, playback);

    const trackUrl = params.track.s3Key
      ? await this.s3.getPresignedUrl(params.track.s3Key)
      : null;

    this.gateway.broadcastToStore(params.storeId, 'store-now-playing', {
      storeId: params.storeId,
      trackId: params.track.id,
      track: toTrackMeta(params.track),
      trackUrl,
      positionMs: params.positionMs,
      serverTs,
      queue: {
        index: params.trackIndex,
        total: params.trackIds.length,
        remaining: params.trackIds.length - params.trackIndex - 1,
      },
    });

    return playback;
  }

  /** Xoá override + hàng chờ riêng của mọi quán thuộc nhóm — dùng khi nhóm bắt
   * đầu phát để "kéo" mọi quán về trạng thái in-sync ngay trong DB/Redis, thay
   * vì chỉ dựa vào việc quán tự bấm "Rejoin Group". */
  private async clearGroupStoreOverrides(groupId: string): Promise<void> {
    const stores = await this.prisma.store.findMany({
      where: { syncGroupId: groupId },
      select: { id: true },
    });
    if (stores.length === 0) return;

    const storeIds = stores.map((store) => store.id);
    await Promise.all(
      storeIds.flatMap((storeId) => [
        this.redis.clearStoreOverride(storeId),
        this.redis.clearStorePlayback(storeId),
      ]),
    );

    await this.prisma.storeOverride.updateMany({
      where: { storeId: { in: storeIds } },
      data: { isOverridden: false },
    });
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
    // Hàng chờ riêng còn sót lại sẽ khiến quán tiếp tục phát nhạc của mình
    await this.redis.clearStorePlayback(storeId);

    await this.prisma.storeOverride.upsert({
      where: { storeId },
      update: { isOverridden: false, rejoinedAt: new Date() },
      create: { storeId, isOverridden: false },
    });

    if (!store.syncGroupId) return { rejoined: true, state: null };

    const state = await this.redis.getGroupState(store.syncGroupId);
    if (!state?.isPlaying || !state.trackId || !state.startedAtServerTs) {
      // Nhóm đang dừng thì không có gì để bắt kịp — im lặng là đúng
      return { rejoined: true, state };
    }

    // Bắt kịp giữa bài: bù đúng khoảng đã trôi kể từ lúc nhóm bắt đầu phát,
    // nếu không quán vừa quay lại sẽ phát lại bài từ đầu và lệch cả nhóm.
    const track = await this.prisma.track.findFirst({
      where: { id: state.trackId },
    });
    if (!track) return { rejoined: true, state };

    const trackUrl = track.s3Key
      ? await this.s3.getPresignedUrl(track.s3Key)
      : null;

    this.gateway.broadcastToStore(storeId, 'now-playing', {
      groupId: store.syncGroupId,
      trackId: state.trackId,
      track: toTrackMeta(track),
      trackUrl,
      positionMs: elapsedPositionMs(state),
      serverTs: Date.now(),
      mode: state.mode,
    });

    return { rejoined: true, state };
  }

  async getGroupState(groupId: string, user: JwtPayload) {
    const group = await this.prisma.syncGroup.findFirst({
      where: { id: groupId, organizationId: user.organizationId! },
    });
    if (!group) throw new NotFoundException('Sync group not found');

    return this.redis.getGroupState(groupId);
  }

  // ── Ảnh chụp trạng thái khi client mở trang ──────────────────────────────
  // Broadcast WS không replay khi join room: trang mở sau lúc admin bấm phát sẽ
  // trắng trơn tới tận lần chuyển bài kế tiếp nếu không hỏi được cái này.

  /** Quán đang phát nhạc riêng thì ưu tiên hàng chờ của quán, không thì theo nhóm. */
  async nowPlayingForStore(
    storeId: string,
    user: JwtPayload,
  ): Promise<NowPlayingSnapshot | null> {
    const store = await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (playback) {
      const trackId = playback.trackIds[playback.trackIndex];
      const track = await this.prisma.track.findFirst({
        where: { id: trackId },
      });
      if (!track) return null;

      return {
        source: 'STORE',
        groupId: store.syncGroupId,
        storeId,
        track: toTrackMeta(track),
        trackUrl: await this.presign(track.s3Key),
        positionMs: elapsedPositionMs(playback),
        serverTs: Date.now(),
        isPlaying: playback.isPlaying,
        queue: {
          index: playback.trackIndex,
          total: playback.trackIds.length,
          remaining: playback.trackIds.length - playback.trackIndex - 1,
        },
      };
    }

    if (!store.syncGroupId) return null;
    return this.groupSnapshot(store.syncGroupId, storeId);
  }

  /** Cùng ảnh chụp đó nhưng cho dashboard của admin, không gắn với quán nào. */
  async nowPlayingForGroup(
    groupId: string,
    user: JwtPayload,
  ): Promise<NowPlayingSnapshot | null> {
    const group = await this.prisma.syncGroup.findFirst({
      where: { id: groupId, organizationId: user.organizationId! },
    });
    if (!group) throw new NotFoundException('Sync group not found');

    return this.groupSnapshot(groupId, null);
  }

  private async groupSnapshot(
    groupId: string,
    storeId: string | null,
  ): Promise<NowPlayingSnapshot | null> {
    const state = await this.redis.getGroupState(groupId);
    if (!state?.trackId) return null;

    const track = await this.prisma.track.findFirst({
      where: { id: state.trackId },
    });
    if (!track) return null;

    return {
      source: 'GROUP',
      groupId,
      storeId,
      track: toTrackMeta(track),
      trackUrl: await this.presign(track.s3Key),
      positionMs: elapsedPositionMs(state),
      serverTs: Date.now(),
      isPlaying: state.isPlaying,
      queue: null,
    };
  }

  private presign(s3Key: string | null) {
    return s3Key ? this.s3.getPresignedUrl(s3Key) : Promise.resolve(null);
  }
}

/**
 * Vị trí thật tại thời điểm hỏi. Đang phát thì phải cộng khoảng đã trôi kể từ
 * `startedAtServerTs`, không thì client vào giữa bài sẽ tua ngược về đầu.
 */
function elapsedPositionMs(state: {
  positionMs: number;
  startedAtServerTs: number | null;
  isPlaying: boolean;
}): number {
  if (!state.isPlaying || !state.startedAtServerTs) return state.positionMs;
  return state.positionMs + (Date.now() - state.startedAtServerTs);
}
