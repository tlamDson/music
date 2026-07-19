'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api-client';

// Audio dùng chung toàn trang — chỉ một preview phát tại một thời điểm
let sharedAudio: HTMLAudioElement | null = null;
let stopActive: (() => void) | null = null;

interface TrackPlayButtonProps {
  trackId: string;
  title: string;
}

export default function TrackPlayButton({ trackId, title }: TrackPlayButtonProps) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      // Unmount khi đang phát → dừng để không phát mồ côi
      if (stopActive && playing) {
        sharedAudio?.pause();
        stopActive = null;
      }
    };
  }, [playing]);

  const stop = () => {
    sharedAudio?.pause();
    setPlaying(false);
    stopActive = null;
  };

  const play = async () => {
    if (playing) {
      stop();
      return;
    }
    setLoading(true);
    try {
      const { url } = await api.get<{ url: string }>(`/tracks/${trackId}/stream-url`);
      stopActive?.(); // dừng track khác đang preview
      if (!sharedAudio) sharedAudio = new Audio();
      sharedAudio.src = url;
      sharedAudio.onended = () => {
        setPlaying(false);
        stopActive = null;
      };
      await sharedAudio.play();
      setPlaying(true);
      stopActive = () => setPlaying(false);
    } catch {
      toast.error(`Không phát được "${title}"`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={() => void play()}
      disabled={loading}
      className="p-2 rounded cursor-pointer transition-all duration-150 hover:opacity-80 focus-visible:outline-none"
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
