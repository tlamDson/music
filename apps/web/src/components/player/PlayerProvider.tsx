'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../../lib/api-client';

export type PlayerMode = 'group' | 'local' | 'preview';

export interface PlayerTrack {
  id: string;
  title: string;
  artist?: string | null;
  url: string;
  durationMs?: number;
}

export interface PlayerQueueInfo {
  index: number;
  total: number;
  remaining: number;
}

interface PlayOptions {
  /**
   * `group` — nghe theo nhóm sync, server điều khiển hoàn toàn.
   * `local` — quán tách ra phát playlist riêng, hết bài thì hỏi server bài kế.
   * `preview` — nghe thử một bài trong dashboard, hết là dừng.
   */
  mode?: PlayerMode;
  storeId?: string | null;
  positionMs?: number;
  queue?: PlayerQueueInfo | null;
}

interface PlayerContextValue {
  current: PlayerTrack | null;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  volume: number;
  mode: PlayerMode;
  storeId: string | null;
  queue: PlayerQueueInfo | null;
  playTrack: (track: PlayerTrack, options?: PlayOptions) => void;
  toggle: () => void;
  pause: () => void;
  seek: (positionMs: number) => void;
  changeVolume: (volume: number) => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used inside a PlayerProvider');
  }
  return context;
}

/**
 * Một thẻ audio duy nhất cho cả app. Trước đây mỗi trang tự tạo `new Audio()`
 * (TrackPlayButton giữ biến module-level, player page giữ ref riêng) nên hai
 * nguồn nhạc phát chồng lên nhau.
 */
// Lệch quá ngưỡng này (đồng hồ nhóm so với currentTime thật) mới re-seek —
// tránh giật hình do jitter nhỏ của timeupdate.
const DRIFT_THRESHOLD_MS = 750;

/** "Neo" đồng bộ: tại thời điểm cục bộ `atLocalTs`, vị trí phát đúng là
 * `positionMs`. Đồng hồ chạy 1x nên vị trí sống = positionMs + thời gian đã
 * trôi kể từ atLocalTs — không phụ thuộc việc client này có đang pause hay
 * không, vì nhóm/quán vẫn tính giờ ở server bất kể client làm gì.
 */
interface SyncAnchor {
  positionMs: number;
  atLocalTs: number;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef<PlayerMode>('preview');
  const storeIdRef = useRef<string | null>(null);
  const currentTrackIdRef = useRef<string | null>(null);
  const anchorRef = useRef<SyncAnchor | null>(null);
  const pendingSeekMsRef = useRef<number | null>(null);

  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(1);
  const [mode, setMode] = useState<PlayerMode>('preview');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [queue, setQueue] = useState<PlayerQueueInfo | null>(null);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  }, []);

  /** Vị trí "đúng ra phải ở đâu ngay bây giờ" theo neo đồng bộ hiện tại. */
  const liveTargetMs = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return null;
    return Math.max(0, anchor.positionMs + (Date.now() - anchor.atLocalTs));
  }, []);

  useEffect(() => {
    const audio = ensureAudio();

    const handleTimeUpdate = () => {
      setPositionMs(audio.currentTime * 1000);

      // Tự chỉnh trôi: quán bấm dừng cục bộ rồi phát lại (hoặc mạng chậm) sẽ
      // tụt dần so với đồng hồ nhóm — kéo về đúng giây mà không cần gọi server.
      if (modeRef.current !== 'group' && modeRef.current !== 'local') return;
      if (audio.paused || audio.seeking) return;
      const target = liveTargetMs();
      if (target === null) return;
      if (Math.abs(audio.currentTime * 1000 - target) > DRIFT_THRESHOLD_MS) {
        audio.currentTime = target / 1000;
      }
    };
    const handleDuration = () =>
      setDurationMs(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0);
    const handleCanPlay = () => {
      if (pendingSeekMsRef.current === null) return;
      // Đã tải xong metadata rồi mới seek — set currentTime trước đó bị trình
      // duyệt bỏ qua/kẹp về 0 vì media chưa seekable.
      audio.currentTime = pendingSeekMsRef.current / 1000;
      pendingSeekMsRef.current = null;
    };
    const handleEnded = () => {
      setIsPlaying(false);

      // Chỉ chế độ local mới do client lái hàng chờ; server quyết định là bài
      // kế hay đã tới lúc quay lại nhóm sync.
      if (modeRef.current !== 'local' || !storeIdRef.current) return;
      void api.post(`/sync/stores/${storeIdRef.current}/next`).catch(() => null);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDuration);
    audio.addEventListener('loadedmetadata', handleDuration);
    audio.addEventListener('loadedmetadata', handleCanPlay);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDuration);
      audio.removeEventListener('loadedmetadata', handleDuration);
      audio.removeEventListener('loadedmetadata', handleCanPlay);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [ensureAudio, liveTargetMs]);

  const playTrack = useCallback(
    (track: PlayerTrack, options: PlayOptions = {}) => {
      const audio = ensureAudio();
      const nextMode = options.mode ?? 'preview';
      const startPositionMs = options.positionMs ?? 0;

      modeRef.current = nextMode;
      storeIdRef.current = options.storeId ?? null;

      setMode(nextMode);
      setStoreId(options.storeId ?? null);
      setQueue(options.queue ?? null);
      setCurrent(track);
      setDurationMs(track.durationMs ?? 0);
      setPositionMs(startPositionMs);

      // Neo lại đồng hồ đồng bộ ở mọi lần nhận vị trí từ server (play mới,
      // rejoin, resume) — đây là điểm tham chiếu để tự bắt kịp nhóm sau này.
      anchorRef.current =
        nextMode === 'group' || nextMode === 'local'
          ? { positionMs: startPositionMs, atLocalTs: Date.now() }
          : null;

      // rejoin() presign lại URL mỗi lần dù cùng bài — so theo track id để
      // khỏi reload từ đầu (mất buffer, trễ đúng bằng thời gian tải lại).
      const sameTrack = currentTrackIdRef.current === track.id;
      currentTrackIdRef.current = track.id;

      if (sameTrack) {
        pendingSeekMsRef.current = null;
        audio.currentTime = startPositionMs / 1000;
      } else {
        audio.src = track.url;
        // Set ngay phòng khi media đã sẵn sàng đồng bộ (từ cache); nếu trình
        // duyệt bỏ qua vì chưa seekable thì handleCanPlay sẽ seek lại đúng
        // vị trí đã trôi thêm trong lúc tải, thay vì kẹt ở vị trí cũ.
        audio.currentTime = startPositionMs / 1000;
        pendingSeekMsRef.current = startPositionMs;
      }

      void audio
        .play()
        .then(() => setIsPlaying(true))
        // Trình duyệt chặn autoplay tới khi có tương tác — nút phát ở thanh
        // player là chỗ người dùng bấm để mở khoá.
        .catch(() => setIsPlaying(false));
    },
    [ensureAudio],
  );

  const toggle = useCallback(() => {
    const audio = ensureAudio();

    if (audio.paused) {
      // Quán/nhóm đang đồng bộ thì dừng cục bộ không dừng đồng hồ server —
      // phát lại phải nhảy tới vị trí sống hiện tại, không tiếp tục từ chỗ cũ.
      if (modeRef.current === 'group' || modeRef.current === 'local') {
        const target = liveTargetMs();
        if (target !== null) audio.currentTime = target / 1000;
      }

      void audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      return;
    }

    audio.pause();
    setIsPlaying(false);
  }, [ensureAudio, liveTargetMs]);

  // Dừng hẳn theo lệnh server — khác `toggle` ở chỗ không bao giờ tự phát lại.
  const pause = useCallback(() => {
    const audio = ensureAudio();
    audio.pause();
    setIsPlaying(false);
  }, [ensureAudio]);

  const seek = useCallback(
    (nextPositionMs: number) => {
      const audio = ensureAudio();
      audio.currentTime = nextPositionMs / 1000;
      setPositionMs(nextPositionMs);

      // Seek tay cũng phải dời neo, nếu không lần timeupdate kế tự kéo ngược
      // về vị trí cũ vì lệch quá ngưỡng.
      if (anchorRef.current) {
        anchorRef.current = { positionMs: nextPositionMs, atLocalTs: Date.now() };
      }
    },
    [ensureAudio],
  );

  const changeVolume = useCallback(
    (nextVolume: number) => {
      const audio = ensureAudio();
      audio.volume = nextVolume;
      setVolume(nextVolume);
    },
    [ensureAudio],
  );

  const stop = useCallback(() => {
    const audio = ensureAudio();
    audio.pause();
    audio.currentTime = 0;

    anchorRef.current = null;
    currentTrackIdRef.current = null;
    pendingSeekMsRef.current = null;

    setIsPlaying(false);
    setCurrent(null);
    setQueue(null);
    setPositionMs(0);
  }, [ensureAudio]);

  const value = useMemo(
    () => ({
      current,
      isPlaying,
      positionMs,
      durationMs,
      volume,
      mode,
      storeId,
      queue,
      playTrack,
      toggle,
      pause,
      seek,
      changeVolume,
      stop,
    }),
    [
      current,
      isPlaying,
      positionMs,
      durationMs,
      volume,
      mode,
      storeId,
      queue,
      playTrack,
      toggle,
      pause,
      seek,
      changeVolume,
      stop,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
