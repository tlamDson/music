'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useSync } from '../../hooks/useSync';
import { useClockOffset } from '../../hooks/useClockOffset';
import { api } from '../../lib/api-client';
import type { ApiResponse, Playlist } from '@cafe-music/shared';

interface StoreStatus {
  storeId: string;
  name: string;
  syncGroupId: string | null;
  override: { isOverridden: boolean; overriddenAt: string | null } | null;
}

export default function MyStorePage() {
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState('');

  const { offset, measureOffset } = useClockOffset();
  const storeId = user?.storeId ?? '';
  const { isConnected, nowPlaying } = useSync({
    storeId,
    token,
    audioRef,
    clockOffset: offset,
  });

  useEffect(() => {
    const t = localStorage.getItem('accessToken');
    setToken(t);
  }, []);

  useEffect(() => {
    if (!user?.storeId) return;

    void measureOffset();

    api
      .get<StoreStatus>(`/stores/${user.storeId}/status`)
      .then(setStatus)
      .catch(() => null);

    api
      .get<ApiResponse<Playlist[]>>('/playlists')
      .then((res) => setPlaylists(res.data))
      .catch(() => []);
  }, [user, measureOffset]);

  const handleUnlock = () => {
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.ontimeupdate = null;
    setUnlocked(true);
  };

  const handleOverride = async () => {
    if (!user?.storeId) return;
    setOverriding(true);
    try {
      await api.post(`/sync/stores/${user.storeId}/override`, {
        playlistId: selectedPlaylist || undefined,
      });
      const s = await api.get<StoreStatus>(`/stores/${user.storeId}/status`);
      setStatus(s);
    } finally {
      setOverriding(false);
    }
  };

  const handleRejoin = async () => {
    if (!user?.storeId) return;
    await api.post(`/sync/stores/${user.storeId}/rejoin`);
    const s = await api.get<StoreStatus>(`/stores/${user.storeId}/status`);
    setStatus(s);
  };

  if (!user?.storeId) {
    return (
      <div style={{ color: 'var(--color-foreground)' }}>No store assigned to your account.</div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Quán của tôi
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          {status?.name ?? 'Loading...'}
        </p>
      </div>

      {/* Connection & status */}
      <div
        className="p-4 rounded-xl flex items-center gap-4"
        style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
      >
        <div
          className="w-3 h-3 rounded-full"
          style={{
            backgroundColor: isConnected ? 'var(--color-accent)' : 'var(--color-destructive)',
          }}
        />
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
            {isConnected ? 'Connected to sync' : 'Disconnected'}
          </p>
          <p className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
            {status?.override?.isOverridden
              ? 'Overriding — playing independently'
              : status?.syncGroupId
                ? 'In sync group'
                : 'Not in any sync group'}
          </p>
        </div>
      </div>

      {/* Now playing */}
      {nowPlaying && (
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.3)',
          }}
        >
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-accent)' }}>
            NOW PLAYING
          </p>
          <p className="text-sm" style={{ color: 'var(--color-foreground)' }}>
            {nowPlaying.trackId}
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Mode: {nowPlaying.mode} · offset: {offset}ms
          </p>
        </div>
      )}

      {/* Unlock + Override controls */}
      {!unlocked ? (
        <button
          onClick={handleUnlock}
          className="w-full py-3 rounded-lg font-semibold cursor-pointer transition-all duration-200 hover:opacity-90"
          style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
        >
          Bắt đầu phát
        </button>
      ) : (
        <div className="flex flex-col gap-4">
          {!status?.override?.isOverridden ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                Override: Play a different playlist
              </p>
              <select
                value={selectedPlaylist}
                onChange={(e) => setSelectedPlaylist(e.target.value)}
                className="px-4 py-2 rounded-lg text-sm outline-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-border)',
                }}
                aria-label="Select override playlist"
              >
                <option value="">— Select playlist (optional) —</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void handleOverride()}
                disabled={overriding}
                className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-80"
                style={{
                  backgroundColor: 'var(--color-destructive)',
                  color: 'white',
                  opacity: overriding ? 0.6 : 1,
                }}
              >
                {overriding ? 'Overriding...' : 'Override Sync Group'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: 'var(--color-destructive)',
                }}
              >
                Currently overriding sync group
              </div>
              <button
                onClick={() => void handleRejoin()}
                className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-80"
                style={{ backgroundColor: 'var(--color-secondary)', color: 'white' }}
              >
                Rejoin Sync Group
              </button>
            </div>
          )}
        </div>
      )}

      <a
        href={`/player/${user.storeId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-center cursor-pointer underline"
        style={{ color: 'var(--color-secondary)' }}
      >
        Open full-screen player →
      </a>
    </div>
  );
}
