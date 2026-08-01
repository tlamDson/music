'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  WsStoreNowPlayingPayload,
  WsStoreModeChangedPayload,
  WsStoreStatePayload,
  NowPlayingSnapshot,
  StoreRepeatMode,
} from '@cafe-music/shared';
import { api } from '../lib/api-client';
import { resolveWsUrl } from '../lib/env';
import { usePlayer } from '../components/player/PlayerProvider';

interface UseSyncOptions {
  /** Quán cần nghe. Bỏ trống (hoặc token null) thì không mở socket. */
  storeId?: string;
  token: string | null;
  clockOffset?: number;
}

interface SyncState {
  isConnected: boolean;
  /** Hàng chờ đang phát của quán; null = quán chưa phát gì. */
  storeQueue: WsStoreNowPlayingPayload['queue'] | null;
  /** Playlist đang phát; chỉ biết được qua hydrate (`now-playing` không có trong
   * broadcast live) — null khi quán chưa phát gì hoặc chưa hydrate xong. */
  playlistId: string | null;
  /** Repeat/shuffle do server xác nhận — cập nhật theo cả `store-now-playing`
   * lẫn `store-mode-changed`. */
  repeat: StoreRepeatMode;
  shuffle: boolean;
}

const WS_URL = resolveWsUrl(process.env.NEXT_PUBLIC_WS_URL);

/**
 * Cầu nối giữa WebSocket và thẻ audio dùng chung (`PlayerProvider`). Chỉ còn
 * một luồng — theo quán — sau khi tầng sync group bị bỏ.
 *
 * Hook không tự lái audio: nó đẩy vào provider, thanh phát ở layout gốc tự lên.
 */
export function useSync({ storeId, token, clockOffset = 0 }: UseSyncOptions): SyncState {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [storeQueue, setStoreQueue] = useState<WsStoreNowPlayingPayload['queue'] | null>(null);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [repeat, setRepeat] = useState<StoreRepeatMode>('OFF');
  const [shuffle, setShuffle] = useState(false);

  const { playTrack, pauseStore, stopStore, setPlaybackMode } = usePlayer();

  // Giữ những giá trị hay đổi trong ref để effect socket chỉ phụ thuộc
  // token/storeId — nếu không `clockOffset` đổi sau mỗi lần đo đồng hồ sẽ kéo
  // socket dựng lại và nuốt mất event trong cửa sổ reconnect.
  const clockOffsetRef = useRef(clockOffset);
  clockOffsetRef.current = clockOffset;
  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;
  const pauseStoreRef = useRef(pauseStore);
  pauseStoreRef.current = pauseStore;
  const stopStoreRef = useRef(stopStore);
  stopStoreRef.current = stopStore;
  const setPlaybackModeRef = useRef(setPlaybackMode);
  setPlaybackModeRef.current = setPlaybackMode;

  const playStoreTrack = useCallback(
    (payload: WsStoreNowPlayingPayload) => {
      // Một tab có thể giữ socket của nhiều quán (dashboard trước đây mở một
      // socket cho mỗi quán). Event của quán khác lọt vào đây thì nó ghi đè
      // hàng chờ + cướp thẻ audio dùng chung — đúng bug QC "store admin đổi bài
      // làm cả chuỗi đổi theo". Bỏ qua mọi payload không phải của quán này.
      if (!storeId || payload.storeId !== storeId) return;

      setStoreQueue(payload.queue);
      setRepeat(payload.repeat);
      setShuffle(payload.shuffle);
      if (!payload.trackUrl) return;

      const serverNow = Date.now() + clockOffsetRef.current;
      const elapsedMs = payload.positionMs + (serverNow - payload.serverTs);

      playTrackRef.current(
        {
          id: payload.track.id,
          title: payload.track.title,
          artist: payload.track.artist,
          url: payload.trackUrl,
          durationMs: payload.track.durationMs,
        },
        {
          mode: 'store',
          storeId,
          positionMs: Math.max(0, elapsedMs),
          queue: payload.queue,
          repeat: payload.repeat,
          shuffle: payload.shuffle,
        },
      );
    },
    [storeId],
  );

  // Broadcast WS là fire-and-forget, không replay khi join room. Mở trang sau
  // lúc admin bấm phát thì phải hỏi trạng thái hiện tại, nếu không sẽ trắng cho
  // tới lần chuyển bài kế tiếp.
  const hydrate = useCallback(async () => {
    if (!storeId) return;

    try {
      const snapshot = await api.get<NowPlayingSnapshot | null>(
        `/sync/stores/${storeId}/now-playing`,
      );
      if (!snapshot?.isPlaying) return;

      // `playlistId` chỉ có trong snapshot hydrate, broadcast live
      // (`store-now-playing`) không mang field này.
      setPlaylistId(snapshot.playlistId);

      playStoreTrack({
        storeId: snapshot.storeId,
        trackId: snapshot.track.id,
        track: snapshot.track,
        trackUrl: snapshot.trackUrl,
        positionMs: snapshot.positionMs,
        serverTs: snapshot.serverTs,
        queue: snapshot.queue ?? { index: 0, total: 1, remaining: 0 },
        repeat: snapshot.repeat,
        shuffle: snapshot.shuffle,
      });
    } catch {
      // Chưa phát gì hoặc API lỗi — vẫn connected, chờ broadcast lần sau
    }
  }, [storeId, playStoreTrack]);

  useEffect(() => {
    if (!token || !storeId) return;

    const socket = io(`${WS_URL}/sync`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      // Join lại sau mỗi lần connect (kể cả reconnect), rồi hydrate.
      socket.emit('join-store', { storeId });
      void hydrate();
    });
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('store-now-playing', (payload: WsStoreNowPlayingPayload) => playStoreTrack(payload));
    // `store-paused`/`store-stopped` từng bỏ payload đi hoàn toàn nên event của
    // quán khác cũng dừng được nhạc đang phát trong tab này. Lọc theo `storeId`
    // và chỉ dừng qua `pauseStore`/`stopStore` (tự no-op nếu thẻ audio đang phát
    // nhạc của quán khác).
    socket.on('store-paused', (payload: WsStoreStatePayload) => {
      if (payload?.storeId !== storeId) return;
      pauseStoreRef.current(storeId);
    });
    socket.on('store-stopped', (payload: WsStoreStatePayload) => {
      if (payload?.storeId !== storeId) return;
      stopStoreRef.current(storeId);
      setStoreQueue(null);
      setPlaylistId(null);
      setRepeat('OFF');
      setShuffle(false);
    });
    // Đổi repeat/shuffle không làm gián đoạn nhạc đang phát — broadcast riêng
    // (khác `store-now-playing`) để không phải reload cả track chỉ vì đổi mode.
    socket.on('store-mode-changed', (payload: WsStoreModeChangedPayload) => {
      if (payload.storeId !== storeId) return;
      setRepeat(payload.repeat);
      setShuffle(payload.shuffle);
      setPlaybackModeRef.current({ repeat: payload.repeat, shuffle: payload.shuffle });
    });

    return () => {
      socket.disconnect();
      // Rời quán này (đổi sang quán khác, rời trang chi tiết, đăng xuất) thì
      // thẻ audio phải im theo. Nếu không, thanh phát vẫn chạy nhạc của quán vừa
      // rời và nút "Bài kế tiếp" trên đó lại bắn lệnh vào quán đó.
      stopStoreRef.current(storeId);
    };
  }, [token, storeId, hydrate, playStoreTrack]);

  return { isConnected, storeQueue, playlistId, repeat, shuffle };
}
