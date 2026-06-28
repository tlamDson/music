'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { WsNowPlayingPayload, SyncGroupState } from '@cafe-music/shared';

interface UseSyncOptions {
  storeId: string;
  token: string | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  clockOffset?: number;
}

interface SyncState {
  isConnected: boolean;
  nowPlaying: WsNowPlayingPayload | null;
  groupState: Partial<SyncGroupState> | null;
  isPlaying: boolean;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

export function useSync({ storeId, token, audioRef, clockOffset = 0 }: UseSyncOptions): SyncState {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<WsNowPlayingPayload | null>(null);
  const [groupState, setGroupState] = useState<Partial<SyncGroupState> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleNowPlaying = useCallback(
    async (payload: WsNowPlayingPayload) => {
      setNowPlaying(payload);
      setIsPlaying(true);

      const audio = audioRef.current;
      if (!audio) return;

      if (payload.trackUrl && audio.src !== payload.trackUrl) {
        audio.src = payload.trackUrl;
      }

      const serverNow = Date.now() + clockOffset;
      const elapsedMs = payload.positionMs + (serverNow - payload.serverTs);
      audio.currentTime = Math.max(0, elapsedMs / 1000);

      try {
        await audio.play();
      } catch {
        // Autoplay blocked — user must click to start
      }
    },
    [audioRef, clockOffset],
  );

  useEffect(() => {
    if (!token) return;

    const socket = io(`${WS_URL}/sync`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('now-playing', (payload: WsNowPlayingPayload) => {
      void handleNowPlaying(payload);
    });

    socket.on('paused', () => {
      audioRef.current?.pause();
      setIsPlaying(false);
    });

    socket.on('stopped', () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setNowPlaying(null);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, handleNowPlaying, audioRef]);

  return { isConnected, nowPlaying, groupState, isPlaying };
}
