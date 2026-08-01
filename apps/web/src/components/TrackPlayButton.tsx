'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api-client';
import { usePlayer } from './player/PlayerProvider';

interface TrackPlayButtonProps {
  trackId: string;
  title: string;
  artist?: string | null;
  durationMs?: number;
}

/**
 * Nghe thử một track trong dashboard. Audio dùng chung của PlayerProvider nên
 * bấm nghe thử sẽ thay thế bài đang phát thay vì chồng tiếng lên nhau.
 */
export default function TrackPlayButton({
  trackId,
  title,
  artist,
  durationMs,
}: TrackPlayButtonProps) {
  const { current, isPlaying, playTrack, toggle } = usePlayer();
  const [loading, setLoading] = useState(false);

  const isCurrent = current?.id === trackId;
  const playing = isCurrent && isPlaying;

  const handleClick = async () => {
    if (isCurrent) {
      toggle();
      return;
    }

    setLoading(true);
    try {
      const { url } = await api.get<{ url: string }>(`/tracks/${trackId}/stream-url`);
      playTrack({ id: trackId, title, artist, url, durationMs }, { mode: 'preview' });
    } catch {
      toast.error(`Không phát được "${title}"`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={() => void handleClick()}
      disabled={loading}
      className="p-2 rounded cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-80 focus-visible:outline-none"
      style={{ color: 'var(--color-accent)', opacity: loading ? 0.5 : 1 }}
      aria-label={playing ? `Pause ${title}` : `Play ${title}`}
    >
      {playing ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
          <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
        </svg>
      )}
    </button>
  );
}
