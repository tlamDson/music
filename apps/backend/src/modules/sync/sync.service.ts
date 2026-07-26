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
  StorePlayDto,
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

/**
 * Một luồng phát duy nhất: **theo quán**.
 *
 * Trước đây có hai luồng song song — nhóm sync (`SyncGroup`) và nhạc riêng của
 * quán — kèm cả bộ khái niệm override/rejoin để quán tách ra rồi quay về. Nhóm
 * và quán hoá ra trùng chức năng, nên tầng nhóm đã bị bỏ: quán là đơn vị phát,
 * state nằm ở Redis `store:<id>:playback`, nhạc đi qua room `store:<id>`.
 */
@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  /**
   * Hẹn giờ chuyển bài của từng quán. Nằm trong bộ nhớ nên chỉ đúng khi chạy
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
    const stores = await this.prisma.store.findMany({
      where: { status: 'PLAYING' },
    });

    for (const store of stores) {
      const playback = await this.redis.getStorePlayback(store.id);
      if (!playback?.isPlaying) continue;

      const trackId = playback.trackIds[playback.trackIndex];
      if (!trackId) continue;

      const track = await this.prisma.track.findFirst({
        where: { id: trackId },
      });
      if (!track?.durationMs) continue;

      const remainingMs = track.durationMs - elapsedPositionMs(playback);

      if (remainingMs > 0) {
        this.scheduleAdvance(store.id, remainingMs);
      } else {
        void this.advance(store.id);
      }
    }
  }

  private clearAdvance(storeId: string) {
    const timer = this.advanceTimers.get(storeId);
    if (!timer) return;

    clearTimeout(timer);
    this.advanceTimers.delete(storeId);
  }

  private scheduleAdvance(storeId: string, delayMs: number) {
    this.clearAdvance(storeId);
    if (delayMs <= 0) return;

    this.advanceTimers.set(
      storeId,
      setTimeout(() => {
        void this.advance(storeId).catch((err: unknown) =>
          this.logger.error(
            `Auto-next failed for store ${storeId}`,
            err instanceof Error ? err.stack : String(err),
          ),
        );
      }, delayMs),
    );
  }

  /**
   * Hết bài → bài kế, hết hàng chờ → dừng hẳn (không lặp lại playlist).
   *
   * Chuyển bài do **server** quyết định chứ không phải client bắt sự kiện
   * `ended` rồi gọi lên: một quán mở nhiều màn hình thì mỗi màn sẽ bắn một lệnh
   * next và nhạc nhảy cóc, còn không màn nào mở thì nhạc đứng im.
   */
  private async advance(storeId: string) {
    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback?.isPlaying) return;

    const nextIndex = playback.trackIndex + 1;
    if (nextIndex >= playback.trackIds.length) {
      await this.stopStore(storeId);
      return;
    }

    const track = await this.prisma.track.findFirst({
      where: { id: playback.trackIds[nextIndex] },
    });
    if (!track) {
      await this.stopStore(storeId);
      return;
    }

    await this.startStoreTrack({
      ...playback,
      trackIndex: nextIndex,
      positionMs: 0,
      track,
    });
  }

  /**
   * Một chỗ để admin nhìn ra quán nào đang phát gì, còn mấy bài trong hàng chờ.
   */
  async overview(user: JwtPayload) {
    const stores = await this.prisma.store.findMany({
      where: { organizationId: user.organizationId! },
      orderBy: { name: 'asc' },
    });

    const data = await Promise.all(
      stores.map(async (store) => {
        const playback = await this.redis.getStorePlayback(store.id);

        return {
          storeId: store.id,
          name: store.name,
          status: store.status,
          trackId: playback
            ? (playback.trackIds[playback.trackIndex] ?? null)
            : null,
          isPlaying: playback?.isPlaying ?? false,
          queueRemaining: playback
            ? playback.trackIds.length - playback.trackIndex - 1
            : null,
          connectedScreens: this.gateway.countStoreClients(store.id),
        };
      }),
    );

    return { data };
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

    return this.startStoreTrack({
      storeId,
      playlistId: dto.playlistId,
      trackIds,
      trackIndex,
      positionMs: 0,
      track: entry.track,
    });
  }

  async pauseStore(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) throw new NotFoundException('Store is not playing');

    // Timer chuyển bài phải dừng theo, nếu không nhạc đang tạm dừng vẫn tự nhảy
    // sang bài kế đúng lúc bài cũ "đáng lẽ" hết.
    this.clearAdvance(storeId);

    const paused: StorePlaybackState = {
      ...playback,
      isPlaying: false,
      positionMs: elapsedPositionMs(playback),
    };
    await this.redis.setStorePlayback(storeId, paused);

    await this.prisma.store.update({
      where: { id: storeId },
      data: { status: 'PAUSED' },
    });

    this.gateway.broadcastToStore(storeId, 'store-paused', {
      storeId,
      serverTs: Date.now(),
    });

    return paused;
  }

  async resumeStore(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) throw new NotFoundException('Store is not playing');

    const track = await this.prisma.track.findFirst({
      where: { id: playback.trackIds[playback.trackIndex] },
    });
    if (!track) throw new NotFoundException('Track not found');

    return this.startStoreTrack({ ...playback, track });
  }

  /** Bỏ qua bài đang phát — cùng đường đi với auto-next của server. */
  async nextStore(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) throw new NotFoundException('Store is not playing');

    const nextIndex = playback.trackIndex + 1;
    if (nextIndex >= playback.trackIds.length) {
      await this.stopStore(storeId);
      return { finished: true, playback: null };
    }

    const track = await this.prisma.track.findFirst({
      where: { id: playback.trackIds[nextIndex] },
    });
    if (!track) throw new NotFoundException('Track not found');

    const next = await this.startStoreTrack({
      ...playback,
      trackIndex: nextIndex,
      positionMs: 0,
      track,
    });

    return { finished: false, playback: next };
  }

  async stopStoreFor(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);
    await this.stopStore(storeId);
    return { stopped: true };
  }

  async getStorePlayback(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);
    return this.redis.getStorePlayback(storeId);
  }

  /** Lưu state + presign + broadcast + hẹn giờ chuyển bài — dùng chung cho
   * play/resume/next/auto-next. */
  private async startStoreTrack(params: {
    storeId: string;
    playlistId: string;
    trackIds: string[];
    trackIndex: number;
    positionMs: number;
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
    };

    await this.redis.setStorePlayback(params.storeId, playback);

    await this.prisma.store.update({
      where: { id: params.storeId },
      data: {
        status: 'PLAYING',
        currentTrackId: params.track.id,
        trackIndex: params.trackIndex,
        startedAtTs: BigInt(serverTs),
      },
    });

    const trackUrl = await this.presign(params.track.s3Key);

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

    // Track upload trước khi web biết đo thời lượng có durationMs = 0 → không
    // biết bao giờ hết bài, đành để quán dừng ở đó thay vì đoán bừa.
    const remainingMs = params.track.durationMs - params.positionMs;
    if (params.track.durationMs > 0 && remainingMs > 0) {
      this.scheduleAdvance(params.storeId, remainingMs);
    } else {
      this.clearAdvance(params.storeId);
      if (params.track.durationMs <= 0) {
        this.logger.warn(
          `Track ${params.track.id} has no duration — auto-next disabled for store ${params.storeId}`,
        );
      }
    }

    return playback;
  }

  private async stopStore(storeId: string) {
    this.clearAdvance(storeId);
    await this.redis.clearStorePlayback(storeId);

    await this.prisma.store.update({
      where: { id: storeId },
      data: { status: 'STOPPED', currentTrackId: null, startedAtTs: null },
    });

    this.gateway.broadcastToStore(storeId, 'store-stopped', {
      storeId,
      serverTs: Date.now(),
    });
  }

  // ── Ảnh chụp trạng thái khi client mở trang ──────────────────────────────
  // Broadcast WS không replay khi join room: trang mở sau lúc admin bấm phát sẽ
  // trắng trơn tới tận lần chuyển bài kế tiếp nếu không hỏi được cái này.

  async nowPlayingForStore(
    storeId: string,
    user: JwtPayload,
  ): Promise<NowPlayingSnapshot | null> {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) return null;

    const track = await this.prisma.track.findFirst({
      where: { id: playback.trackIds[playback.trackIndex] },
    });
    if (!track) return null;

    return {
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
