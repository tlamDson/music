'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSync } from '../../../hooks/useSync';
import { useClockOffset } from '../../../hooks/useClockOffset';
import { api } from '../../../lib/api-client';

function ProgressBar({ currentTime, duration }: { currentTime: number; duration: number }) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="w-full rounded-full overflow-hidden"
      style={{ height: 4, backgroundColor: 'var(--color-muted)' }}
    >
      <div
        style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)', height: '100%', transition: 'width 1s linear' }}
      />
    </div>
  );
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PlayerPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [overriding, setOverriding] = useState(false);

  const { offset, measureOffset } = useClockOffset();
  const { isConnected, nowPlaying, isPlaying } = useSync({
    storeId,
    token,
    audioRef,
    clockOffset: offset,
  });

  useEffect(() => {
    const t = localStorage.getItem('accessToken');
    if (t) {
      setToken(t);
      try {
        const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role: string };
        setUserRole(payload.role);
      } catch {
        //
      }
    }
  }, []);

  useEffect(() => {
    void measureOffset();
  }, [measureOffset]);

  const handleUnlock = async () => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    audio.oncanplay = null;
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime * 1000);
    audio.ondurationchange = () => setDuration(audio.duration * 1000);

    setUnlocked(true);
  };

  const handleOverride = async () => {
    setOverriding(true);
    try {
      await api.post(`/sync/stores/${storeId}/override`, {});
    } finally {
      setOverriding(false);
    }
  };

  const handleRejoin = async () => {
    await api.post(`/sync/stores/${storeId}/rejoin`);
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8 flex flex-col gap-6"
        style={{ backgroundColor: 'var(--color-muted)', boxShadow: 'var(--shadow-xl)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold" style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}>
            Cafe Music
          </h1>
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{
              backgroundColor: isConnected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: isConnected ? 'var(--color-accent)' : 'var(--color-destructive)',
            }}
          >
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Album art placeholder */}
        <div
          className="w-full aspect-square rounded-xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-primary)' }}
        >
          {isPlaying ? (
            <svg viewBox="0 0 64 64" className="w-16 h-16" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="14" y="16" width="12" height="32" rx="2" fill="var(--color-accent)" />
              <rect x="38" y="16" width="12" height="32" rx="2" fill="var(--color-accent)" />
            </svg>
          ) : (
            <svg viewBox="0 0 64 64" className="w-16 h-16" fill="none">
              <polygon points="20,14 52,32 20,50" fill="var(--color-accent)" />
            </svg>
          )}
        </div>

        {/* Track info */}
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
            {nowPlaying ? nowPlaying.trackId : 'No track playing'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
            {nowPlaying ? `Mode: ${nowPlaying.mode}` : 'Waiting for sync...'}
          </p>
        </div>

        {/* Progress */}
        <div className="flex flex-col gap-1">
          <ProgressBar currentTime={currentTime} duration={duration} />
          <div className="flex justify-between text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Unlock button — shown until user clicks to unlock autoplay */}
        {!unlocked && (
          <button
            onClick={() => void handleUnlock()}
            className="w-full py-3 rounded-lg font-semibold cursor-pointer text-white transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
            style={{ backgroundColor: 'var(--color-accent)', color: 'white', fontFamily: 'Fira Sans, sans-serif' }}
            aria-label="Start playback"
          >
            Bắt đầu phát
          </button>
        )}

        {/* Store admin controls */}
        {userRole === 'STORE_ADMIN' && unlocked && (
          <div className="flex gap-3">
            <button
              onClick={() => void handleOverride()}
              disabled={overriding}
              className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 hover:opacity-80 focus-visible:outline-none"
              style={{
                backgroundColor: 'var(--color-destructive)',
                color: 'white',
                opacity: overriding ? 0.6 : 1,
              }}
              aria-label="Override sync"
            >
              {overriding ? 'Overriding...' : 'Override'}
            </button>
            <button
              onClick={() => void handleRejoin()}
              className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-200 hover:opacity-80 focus-visible:outline-none"
              style={{ backgroundColor: 'var(--color-secondary)', color: 'white' }}
              aria-label="Rejoin sync group"
            >
              Rejoin
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
