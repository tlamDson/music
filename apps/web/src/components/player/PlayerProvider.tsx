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
export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modeRef = useRef<PlayerMode>('preview');
  const storeIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    const audio = ensureAudio();

    const handleTimeUpdate = () => setPositionMs(audio.currentTime * 1000);
    const handleDuration = () =>
      setDurationMs(Number.isFinite(audio.duration) ? audio.duration * 1000 : 0);
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
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDuration);
      audio.removeEventListener('loadedmetadata', handleDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [ensureAudio]);

  const playTrack = useCallback(
    (track: PlayerTrack, options: PlayOptions = {}) => {
      const audio = ensureAudio();
      const nextMode = options.mode ?? 'preview';

      modeRef.current = nextMode;
      storeIdRef.current = options.storeId ?? null;

      setMode(nextMode);
      setStoreId(options.storeId ?? null);
      setQueue(options.queue ?? null);
      setCurrent(track);
      setDurationMs(track.durationMs ?? 0);
      setPositionMs(options.positionMs ?? 0);

      if (audio.src !== track.url) audio.src = track.url;
      audio.currentTime = (options.positionMs ?? 0) / 1000;

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
      void audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      return;
    }

    audio.pause();
    setIsPlaying(false);
  }, [ensureAudio]);

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
