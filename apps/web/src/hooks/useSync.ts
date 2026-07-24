'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  WsNowPlayingPayload,
  WsStoreNowPlayingPayload,
  NowPlayingSnapshot,
} from '@cafe-music/shared';
import { api } from '../lib/api-client';
import { resolveWsUrl } from '../lib/env';
import { usePlayer } from '../components/player/PlayerProvider';

interface UseSyncOptions {
  /** Console của quán: nghe cả nhóm sync lẫn nhạc riêng của quán. */
  storeId?: string;
  /** Dashboard của admin: chỉ theo dõi nhóm sync này, không có nhạc riêng. */
  groupId?: string | null;
  token: string | null;
  clockOffset?: number;
}

interface SyncState {
  isConnected: boolean;
  nowPlaying: WsNowPlayingPayload | null;
  /** Hàng chờ riêng khi quán tách khỏi nhóm sync; null = đang theo nhóm. */
  storeQueue: WsStoreNowPlayingPayload['queue'] | null;
}

const WS_URL = resolveWsUrl(process.env.NEXT_PUBLIC_WS_URL);

/**
 * Cầu nối giữa WebSocket sync và thẻ audio dùng chung (`PlayerProvider`). Trước
 * đây hook tự lái một `audioRef` truyền vào — nhưng `StoreHome` không bao giờ
 * gán ref đó nên nhạc chết ngay, còn `PlayerBar` thì không thấy gì để hiện. Giờ
 * hook đẩy thẳng vào provider, thanh phát ở layout gốc tự lên.
 */
export function useSync({ storeId, groupId, token, clockOffset = 0 }: UseSyncOptions): SyncState {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<WsNowPlayingPayload | null>(null);
  const [storeQueue, setStoreQueue] = useState<WsStoreNowPlayingPayload['queue'] | null>(null);

  const { playTrack, pause, stop } = usePlayer();

  // Giữ những giá trị hay đổi trong ref để effect socket chỉ phụ thuộc
  // token/storeId/groupId — nếu không `clockOffset` đổi sau mỗi lần đo đồng hồ
  // sẽ kéo socket dựng lại và nuốt mất event trong cửa sổ reconnect.
  const clockOffsetRef = useRef(clockOffset);
  clockOffsetRef.current = clockOffset;
  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;
  const pauseRef = useRef(pause);
  pauseRef.current = pause;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const playGroupTrack = useCallback(
    (payload: WsNowPlayingPayload) => {
      setNowPlaying(payload);
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
        { mode: 'group', storeId: storeId ?? null, positionMs: Math.max(0, elapsedMs) },
      );
    },
    [storeId],
  );

  const playStoreTrack = useCallback(
    (payload: WsStoreNowPlayingPayload) => {
      setStoreQueue(payload.queue);
      if (!payload.trackUrl || !storeId) return;

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
          mode: 'local',
          storeId,
          positionMs: Math.max(0, elapsedMs),
          queue: payload.queue,
        },
      );
    },
    [storeId],
  );

  // Broadcast WS là fire-and-forget, không replay khi join room. Mở trang sau
  // lúc admin bấm phát thì phải hỏi trạng thái hiện tại, nếu không sẽ trắng cho
  // tới lần chuyển bài kế tiếp.
  const hydrate = useCallback(async () => {
    const path = storeId
      ? `/sync/stores/${storeId}/now-playing`
      : groupId
        ? `/sync/groups/${groupId}/now-playing`
        : null;
    if (!path) return;

    try {
      const snapshot = await api.get<NowPlayingSnapshot | null>(path);
      if (!snapshot?.isPlaying) return;

      if (snapshot.source === 'STORE' && snapshot.queue) {
        playStoreTrack({
          storeId: snapshot.storeId ?? storeId!,
          trackId: snapshot.track.id,
          track: snapshot.track,
          trackUrl: snapshot.trackUrl,
          positionMs: snapshot.positionMs,
          serverTs: snapshot.serverTs,
          queue: snapshot.queue,
        });
      } else {
        playGroupTrack({
          groupId: snapshot.groupId ?? groupId ?? '',
          trackId: snapshot.track.id,
          track: snapshot.track,
          trackUrl: snapshot.trackUrl,
          positionMs: snapshot.positionMs,
          serverTs: snapshot.serverTs,
          mode: 'LOOSE',
        });
      }
    } catch {
      // Chưa phát gì hoặc API lỗi — vẫn connected, chờ broadcast lần sau
    }
  }, [storeId, groupId, playGroupTrack, playStoreTrack]);

  useEffect(() => {
    if (!token) return;

    const socket = io(`${WS_URL}/sync`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    // Join lại cả hai kênh sau mỗi lần connect (kể cả reconnect), rồi hydrate.
    const joinRooms = async () => {
      if (storeId) {
        socket.emit('join-store', { storeId });
        try {
          const status = await api.get<{ syncGroupId: string | null }>(`/stores/${storeId}/status`);
          if (status.syncGroupId) socket.emit('join-group', { groupId: status.syncGroupId });
        } catch {
          // Store chưa có group hoặc API lỗi — vẫn connected
        }
      } else if (groupId) {
        socket.emit('join-group', { groupId });
      }

      await hydrate();
    };

    socket.on('connect', () => {
      setIsConnected(true);
      void joinRooms();
    });
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('now-playing', (payload: WsNowPlayingPayload) => playGroupTrack(payload));
    socket.on('store-now-playing', (payload: WsStoreNowPlayingPayload) => playStoreTrack(payload));

    socket.on('store-paused', () => pauseRef.current());
    socket.on('paused', () => pauseRef.current());

    socket.on('store-stopped', () => {
      stopRef.current();
      setStoreQueue(null);
    });
    socket.on('stopped', () => {
      stopRef.current();
      setNowPlaying(null);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, storeId, groupId, hydrate, playGroupTrack, playStoreTrack]);

  return { isConnected, nowPlaying, storeQueue };
}
