'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { StoreRepeatMode } from '@cafe-music/shared';

export type PlayerMode = 'store' | 'preview';

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
   * `store` — nhạc của một quán, server điều khiển (kể cả chuyển bài).
   * `preview` — nghe thử tại chỗ trong dashboard, chỉ người bấm nghe, hết là dừng.
   */
  mode?: PlayerMode;
  storeId?: string | null;
  positionMs?: number;
  queue?: PlayerQueueInfo | null;
  /**
   * Chỉ có ý nghĩa khi `mode: 'store'` — trạng thái do server xác nhận (broadcast
   * `store-now-playing`/hydrate). Mặc định 'OFF'/false cho track mới hoặc preview.
   */
  repeat?: StoreRepeatMode;
  shuffle?: boolean;
}

interface PlayerContextValue {
  current: PlayerTrack | null;
  isPlaying: boolean;
  durationMs: number;
  volume: number;
  mode: PlayerMode;
  storeId: string | null;
  queue: PlayerQueueInfo | null;
  /**
   * Chế độ lặp/trộn hiện tại. Ở `mode: 'store'` phản chiếu đúng trạng thái server
   * (ghi qua `setPlaybackMode`, chờ broadcast `store-mode-changed` xác nhận thay
   * vì tự đổi cục bộ — quán mở hai màn hình mới thấy cùng một trạng thái). Ở
   * `mode: 'preview'` chỉ có `repeat` (ONE/OFF) đổi cục bộ qua `togglePreviewRepeat`
   * vì nghe thử không có gì trên server để đồng bộ.
   */
  repeat: StoreRepeatMode;
  shuffle: boolean;
  playTrack: (track: PlayerTrack, options?: PlayOptions) => void;
  toggle: () => void;
  pause: () => void;
  seek: (positionMs: number) => void;
  changeVolume: (volume: number) => void;
  stop: () => void;
  /** Server xác nhận đổi repeat/shuffle (qua WS) — không đụng vào thẻ audio. */
  setPlaybackMode: (mode: { repeat?: StoreRepeatMode; shuffle?: boolean }) => void;
  /** Nghe thử: đổi cục bộ giữa lặp một bài (audio.loop) và không lặp. */
  togglePreviewRepeat: () => void;
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
 * Vị trí phát tách khỏi context ổn định ở trên. `timeupdate`/rAF bắn nhiều
 * lần mỗi giây — nếu đi qua context như trước, MỌI consumer của `usePlayer()`
 * re-render theo nhịp nhạc kể cả khi chỉ đọc `current`/`isPlaying`/`queue`
 * (bảng track, nút play, `useSync`,...). Store nhỏ ngoài React + hook riêng
 * qua `useSyncExternalStore` để chỉ nơi thật sự cần vị trí (PlayerBar,
 * `/player/[storeId]`) mới re-render.
 */
// `useSyncExternalStore` re-render mỗi lần store đổi giá trị — nếu vòng lặp
// rAF ghi mỗi khung hình (~60 lần/giây) thì PlayerBar và màn kiosk (2 nơi
// DUY NHẤT gọi usePlayerPosition()) lại re-render nhiều hơn hẳn so với hồi
// còn đi qua `timeupdate` (~4 lần/giây) — thắng ở 6 consumer kia nhưng thua
// đậm ở đúng 2 nơi luôn hiện trên màn hình, kể cả màn kiosk chạy 24/7 trong
// quán. `tick()` gộp các lần ghi từ rAF xuống còn ~1 lần mỗi khoảng này.
const POSITION_TICK_INTERVAL_MS = 250;

interface PositionStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  getServerSnapshot: () => number;
  /** Ghi ngay lập tức, không tiết lưu — dùng cho play/seek/stop (cần đúng số). */
  set: (nextPositionMs: number) => void;
  /** Ghi có tiết lưu theo `POSITION_TICK_INTERVAL_MS` — dùng cho vòng lặp rAF. */
  tick: (nextPositionMs: number) => void;
}

function createPositionStore(): PositionStore {
  let value = 0;
  let lastWriteAtMs = 0;
  const listeners = new Set<() => void>();

  const set = (nextPositionMs: number) => {
    lastWriteAtMs = Date.now();
    if (value === nextPositionMs) return;
    value = nextPositionMs;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return value;
    },
    getServerSnapshot() {
      return 0;
    },
    set,
    tick(nextPositionMs) {
      if (Date.now() - lastWriteAtMs < POSITION_TICK_INTERVAL_MS) return;
      set(nextPositionMs);
    },
  };
}

const PlayerPositionContext = createContext<PositionStore | null>(null);

/** Đọc vị trí phát hiện tại (ms) — chỉ re-render component gọi hook này. */
export function usePlayerPosition() {
  const store = useContext(PlayerPositionContext);
  if (!store) {
    throw new Error('usePlayerPosition must be used inside a PlayerProvider');
  }
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}

/**
 * Một thẻ audio duy nhất cho cả app. Trước đây mỗi trang tự tạo `new Audio()`
 * (TrackPlayButton giữ biến module-level, player page giữ ref riêng) nên hai
 * nguồn nhạc phát chồng lên nhau.
 */
// Lệch quá ngưỡng này (đồng hồ quán so với currentTime thật) mới re-seek —
// tránh giật hình do jitter nhỏ của timeupdate.
const DRIFT_THRESHOLD_MS = 750;

/** "Neo" đồng bộ: tại thời điểm cục bộ `atLocalTs`, vị trí phát đúng là
 * `positionMs`. Đồng hồ chạy 1x nên vị trí sống = positionMs + thời gian đã
 * trôi kể từ atLocalTs — không phụ thuộc việc client này có đang pause hay
 * không, vì quán vẫn tính giờ ở server bất kể client làm gì.
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
  const positionStoreRef = useRef<PositionStore | null>(null);
  if (!positionStoreRef.current) positionStoreRef.current = createPositionStore();
  const positionStore = positionStoreRef.current;

  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolume] = useState(1);
  const [mode, setMode] = useState<PlayerMode>('preview');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [queue, setQueue] = useState<PlayerQueueInfo | null>(null);
  const [repeat, setRepeatState] = useState<StoreRepeatMode>('OFF');
  const [shuffle, setShuffleState] = useState(false);

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
      // Tự chỉnh trôi: quán bấm dừng cục bộ rồi phát lại (hoặc mạng chậm) sẽ
      // tụt dần so với đồng hồ server — kéo về đúng giây mà không cần gọi API.
      if (modeRef.current !== 'store') return;
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
    // Chuyển bài do server hẹn giờ và broadcast `store-now-playing`, client
    // không tự gọi `/next` nữa: quán mở hai màn hình thì mỗi màn sẽ bắn một
    // lệnh và nhạc nhảy cóc, còn không màn nào mở thì nhạc đứng im.
    const handleEnded = () => setIsPlaying(false);

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

  // Đẩy vị trí phát vào store ngoài React bằng vòng lặp rAF (thay cho việc
  // setState ở mỗi `timeupdate`, ~4 lần/giây nhưng vẫn re-render mọi consumer
  // của usePlayer() nếu đi qua context). Vòng lặp chỉ chạy khi audio thực sự
  // đang phát — dừng theo sự kiện `pause`/`ended` để không tốn CPU vô ích lúc
  // đứng yên (đặc biệt quan trọng cho màn kiosk chạy 24/7). Đọc `audio.currentTime`
  // mỗi khung hình để mượt, nhưng chỉ GHI vào store qua `positionStore.tick()`
  // (đã tự tiết lưu ~4 lần/giây) — nếu không, PlayerBar/kiosk (2 nơi duy nhất
  // đọc usePlayerPosition()) sẽ re-render ~60 lần/giây thay vì ~4.
  useEffect(() => {
    const audio = ensureAudio();
    const hasRaf =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function';

    let frameId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cancelScheduled = () => {
      if (frameId !== null && hasRaf) window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) clearTimeout(timeoutId);
      frameId = null;
      timeoutId = null;
    };

    const stepFrame = () => {
      positionStore.tick(audio.currentTime * 1000);
      if (hasRaf) {
        frameId = window.requestAnimationFrame(stepFrame);
      } else {
        timeoutId = setTimeout(stepFrame, 16);
      }
    };

    const handlePlay = () => {
      cancelScheduled();
      stepFrame();
    };
    const handleStop = () => {
      cancelScheduled();
      // Đồng bộ giá trị cuối cùng khi dừng/hết bài, tránh kẹt ở khung hình dở.
      // Dùng `set` (không tiết lưu) vì đây là điểm dừng thật, cần đúng số ngay.
      positionStore.set(audio.currentTime * 1000);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handleStop);
    audio.addEventListener('ended', handleStop);

    if (!audio.paused) stepFrame();

    return () => {
      cancelScheduled();
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handleStop);
      audio.removeEventListener('ended', handleStop);
    };
  }, [ensureAudio, positionStore]);

  const playTrack = useCallback(
    (track: PlayerTrack, options: PlayOptions = {}) => {
      const audio = ensureAudio();
      const nextMode = options.mode ?? 'preview';
      const startPositionMs = options.positionMs ?? 0;
      const nextRepeat = options.repeat ?? 'OFF';
      const nextShuffle = options.shuffle ?? false;

      modeRef.current = nextMode;
      storeIdRef.current = options.storeId ?? null;

      setMode(nextMode);
      setStoreId(options.storeId ?? null);
      setQueue(options.queue ?? null);
      setCurrent(track);
      setDurationMs(track.durationMs ?? 0);
      positionStore.set(startPositionMs);
      setRepeatState(nextRepeat);
      setShuffleState(nextShuffle);
      // `loop` chỉ có ý nghĩa ở chế độ nghe thử: quán chuyển bài do server hẹn
      // giờ (kể cả lặp một bài — server tự phát lại đúng track qua timer), audio
      // native loop sẽ đá văng đồng bộ nếu bật ở chế độ store.
      audio.loop = nextMode === 'preview' && nextRepeat === 'ONE';

      // Neo lại đồng hồ đồng bộ ở mọi lần nhận vị trí từ server (play mới,
      // chuyển bài, resume) — điểm tham chiếu để tự bắt kịp quán sau này.
      anchorRef.current =
        nextMode === 'store' ? { positionMs: startPositionMs, atLocalTs: Date.now() } : null;

      // Server presign lại URL mỗi lần broadcast dù cùng bài — so theo track id
      // để khỏi reload từ đầu (mất buffer, trễ đúng bằng thời gian tải lại).
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
    [ensureAudio, positionStore],
  );

  const toggle = useCallback(() => {
    const audio = ensureAudio();

    if (audio.paused) {
      // Dừng cục bộ không dừng đồng hồ server — phát lại phải nhảy tới vị trí
      // sống hiện tại của quán, không tiếp tục từ chỗ đã dừng.
      if (modeRef.current === 'store') {
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
      positionStore.set(nextPositionMs);

      // Seek tay cũng phải dời neo, nếu không lần timeupdate kế tự kéo ngược
      // về vị trí cũ vì lệch quá ngưỡng.
      if (anchorRef.current) {
        anchorRef.current = { positionMs: nextPositionMs, atLocalTs: Date.now() };
      }
    },
    [ensureAudio, positionStore],
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
    audio.loop = false;

    anchorRef.current = null;
    currentTrackIdRef.current = null;
    pendingSeekMsRef.current = null;

    setIsPlaying(false);
    setCurrent(null);
    setQueue(null);
    positionStore.set(0);
    setRepeatState('OFF');
    setShuffleState(false);
  }, [ensureAudio, positionStore]);

  // Server xác nhận đổi repeat/shuffle qua broadcast `store-mode-changed` (đổi
  // mode không làm gián đoạn nhạc) — chỉ cập nhật state hiển thị, không đụng gì
  // tới thẻ audio đang chạy.
  const setPlaybackMode = useCallback(
    (nextMode: { repeat?: StoreRepeatMode; shuffle?: boolean }) => {
      if (nextMode.repeat !== undefined) setRepeatState(nextMode.repeat);
      if (nextMode.shuffle !== undefined) setShuffleState(nextMode.shuffle);
    },
    [],
  );

  // Nghe thử không có state trên server để đồng bộ — lặp một bài chạy hẳn bằng
  // thuộc tính `loop` gốc của thẻ audio, đổi cục bộ ngay khi bấm.
  const togglePreviewRepeat = useCallback(() => {
    if (modeRef.current !== 'preview') return;
    const audio = ensureAudio();
    setRepeatState((prev) => {
      const next = prev === 'ONE' ? 'OFF' : 'ONE';
      audio.loop = next === 'ONE';
      return next;
    });
  }, [ensureAudio]);

  const value = useMemo(
    () => ({
      current,
      isPlaying,
      durationMs,
      volume,
      mode,
      storeId,
      queue,
      repeat,
      shuffle,
      playTrack,
      toggle,
      pause,
      seek,
      changeVolume,
      stop,
      setPlaybackMode,
      togglePreviewRepeat,
    }),
    [
      current,
      isPlaying,
      durationMs,
      volume,
      mode,
      storeId,
      queue,
      repeat,
      shuffle,
      playTrack,
      toggle,
      pause,
      seek,
      changeVolume,
      stop,
      setPlaybackMode,
      togglePreviewRepeat,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlayerPositionContext.Provider value={positionStore}>
        {children}
      </PlayerPositionContext.Provider>
    </PlayerContext.Provider>
  );
}
