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
  StoreRepeatMode,
  PlaybackModeDto,
  NowPlayingSnapshot,
  WsTrackMeta,
} from '@cafe-music/shared';

/** Tua về đầu bài thay vì lùi một bậc nếu đã phát quá mốc này — giống Spotify. */
const PREVIOUS_RESTART_THRESHOLD_MS = 3_000;

/** Fisher-Yates — dùng cho cả bật shuffle giữa chừng và xáo lại khi lặp ALL hết vòng. */
function shuffleIndices(order: number[]): number[] {
  const result = [...order];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

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

      const trackId = this.trackIdAt(playback, playback.trackIndex);
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
   * Hết bài → bài kế theo `repeat`/`shuffle`, hết hàng chờ → dừng hẳn trừ khi
   * `repeat: 'ALL'` (quay về đầu, xáo lại `order` nếu đang shuffle).
   *
   * Chuyển bài do **server** quyết định chứ không phải client bắt sự kiện
   * `ended` rồi gọi lên: một quán mở nhiều màn hình thì mỗi màn sẽ bắn một lệnh
   * next và nhạc nhảy cóc, còn không màn nào mở thì nhạc đứng im.
   */
  private async advance(storeId: string) {
    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback?.isPlaying) return;

    // ONE: phát lại đúng bài đang phát, không sang bài kế.
    if (playback.repeat === 'ONE') {
      const trackId = this.trackIdAt(playback, playback.trackIndex);
      const track = trackId
        ? await this.prisma.track.findFirst({ where: { id: trackId } })
        : null;
      if (!track) {
        await this.stopStore(storeId);
        return;
      }

      await this.startStoreTrack({ ...playback, positionMs: 0, track });
      return;
    }

    let nextIndex = playback.trackIndex + 1;
    let order = playback.order;

    if (nextIndex >= playback.trackIds.length) {
      if (playback.repeat !== 'ALL') {
        await this.stopStore(storeId);
        return;
      }

      // Hết vòng playlist mà lặp ALL → quay về đầu; đang shuffle thì xáo bài mới.
      nextIndex = 0;
      if (playback.shuffle) {
        order = shuffleIndices(playback.trackIds.map((_, i) => i));
      }
    }

    const trackId = playback.trackIds[order[nextIndex]];
    const track = trackId
      ? await this.prisma.track.findFirst({ where: { id: trackId } })
      : null;
    if (!track) {
      await this.stopStore(storeId);
      return;
    }

    await this.startStoreTrack({
      ...playback,
      order,
      trackIndex: nextIndex,
      positionMs: 0,
      track,
    });
  }

  /** Chỉ số vào `trackIds` của vị trí `pos` trong `order`. */
  private trackIdAt(
    playback: StorePlaybackState,
    pos: number,
  ): string | undefined {
    return playback.trackIds[playback.order[pos]];
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
            ? (this.trackIdAt(playback, playback.trackIndex) ?? null)
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

    // Chọn playlist mới → bắt đầu lại từ mặc định (không lặp, không xáo), thứ
    // tự luôn theo đúng playlist.
    return this.startStoreTrack({
      storeId,
      playlistId: dto.playlistId,
      trackIds,
      order: trackIds.map((_, i) => i),
      trackIndex,
      positionMs: 0,
      repeat: 'OFF',
      shuffle: false,
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
      where: { id: this.trackIdAt(playback, playback.trackIndex) },
    });
    if (!track) throw new NotFoundException('Track not found');

    return this.startStoreTrack({ ...playback, track });
  }

  /**
   * Bỏ qua bài đang phát — cùng đường đi với auto-next của server. Đây là lệnh
   * thủ công nên luôn đi tới bài kế thật, không phát lại theo `repeat: 'ONE'`.
   *
   * Ở **bài cuối** thì đây là **no-op**: giữ nguyên nhạc đang phát và trả
   * `finished: true`. Trước đây nó gọi `stopStore()` — xoá state Redis và
   * broadcast `store-stopped` — nên bấm "Bài kế tiếp" ở bài cuối làm thanh phát
   * biến mất và mất luôn ngữ cảnh playlist (QC: "tự out khỏi playlist"). Dừng
   * hẳn khi hết hàng chờ chỉ đúng cho auto-next trong `advance()`, nơi bài cuối
   * đã phát xong thật; ở đây thì chưa. `repeat: 'ALL'` vẫn quay về bài đầu vì
   * lúc đó hàng chờ còn chỗ để đi.
   */
  async nextStore(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) throw new NotFoundException('Store is not playing');

    let nextIndex = playback.trackIndex + 1;
    if (nextIndex >= playback.trackIds.length) {
      if (playback.repeat !== 'ALL') return { finished: true, playback };
      nextIndex = 0;
    }

    const track = await this.prisma.track.findFirst({
      where: { id: this.trackIdAt(playback, nextIndex) },
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

  /**
   * Lùi một bài — giống Spotify: đã phát quá
   * `PREVIOUS_RESTART_THRESHOLD_MS` thì tua về đầu bài hiện tại thay vì lùi
   * thật. Ở bài đầu mà lùi thật (chưa qua ngưỡng) thì theo `repeat`: `ALL`
   * nhảy về bài cuối, còn lại tua về đầu bài hiện tại.
   */
  async previousStore(storeId: string, user: JwtPayload) {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) throw new NotFoundException('Store is not playing');

    let targetIndex = playback.trackIndex;
    if (elapsedPositionMs(playback) <= PREVIOUS_RESTART_THRESHOLD_MS) {
      if (playback.trackIndex > 0) {
        targetIndex = playback.trackIndex - 1;
      } else if (playback.repeat === 'ALL') {
        targetIndex = playback.trackIds.length - 1;
      } else {
        targetIndex = 0;
      }
    }

    const track = await this.prisma.track.findFirst({
      where: { id: this.trackIdAt(playback, targetIndex) },
    });
    if (!track) throw new NotFoundException('Track not found');

    return this.startStoreTrack({
      ...playback,
      trackIndex: targetIndex,
      positionMs: 0,
      track,
    });
  }

  /**
   * Đổi repeat/shuffle không làm gián đoạn nhạc đang phát — chỉ cập nhật state
   * + broadcast `store-mode-changed`, không gọi `startStoreTrack`.
   */
  async setPlaybackMode(
    storeId: string,
    dto: PlaybackModeDto,
    user: JwtPayload,
  ) {
    await this.assertStoreAccess(storeId, user);

    const playback = await this.redis.getStorePlayback(storeId);
    if (!playback) throw new NotFoundException('Store is not playing');

    const repeat: StoreRepeatMode = dto.repeat ?? playback.repeat;
    const shuffle = dto.shuffle ?? playback.shuffle;

    let order = playback.order;
    let trackIndex = playback.trackIndex;

    if (shuffle && !playback.shuffle) {
      // Bật shuffle giữa chừng: xáo lại order nhưng đặt bài đang phát lên đầu
      // để nhạc đang chạy không bị nhảy ngang.
      const currentTrackIdx = playback.order[playback.trackIndex];
      const rest = playback.order.filter((idx) => idx !== currentTrackIdx);
      order = [currentTrackIdx, ...shuffleIndices(rest)];
      trackIndex = 0;
    } else if (!shuffle && playback.shuffle) {
      // Tắt shuffle: quay lại đúng thứ tự playlist gốc, vẫn giữ đúng bài đang phát.
      const currentTrackIdx = playback.order[playback.trackIndex];
      order = playback.trackIds.map((_, i) => i);
      trackIndex = currentTrackIdx;
    }

    const updated: StorePlaybackState = {
      ...playback,
      order,
      trackIndex,
      repeat,
      shuffle,
    };
    await this.redis.setStorePlayback(storeId, updated);

    this.gateway.broadcastToStore(storeId, 'store-mode-changed', {
      storeId,
      repeat,
      shuffle,
    });

    return updated;
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
    order: number[];
    trackIndex: number;
    positionMs: number;
    repeat: StoreRepeatMode;
    shuffle: boolean;
    track: TrackRow;
  }): Promise<StorePlaybackState> {
    const serverTs = Date.now();
    const playback: StorePlaybackState = {
      storeId: params.storeId,
      playlistId: params.playlistId,
      trackIds: params.trackIds,
      order: params.order,
      trackIndex: params.trackIndex,
      positionMs: params.positionMs,
      startedAtServerTs: serverTs,
      isPlaying: true,
      repeat: params.repeat,
      shuffle: params.shuffle,
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
      repeat: params.repeat,
      shuffle: params.shuffle,
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
      where: { id: this.trackIdAt(playback, playback.trackIndex) },
    });
    if (!track) return null;

    return {
      storeId,
      playlistId: playback.playlistId,
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
      repeat: playback.repeat,
      shuffle: playback.shuffle,
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
