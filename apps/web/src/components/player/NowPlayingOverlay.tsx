'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePlayer, usePlayerPosition } from './PlayerProvider';
import CoverArt from '../media/CoverArt';
import MarqueeText from './MarqueeText';
import TransportControls from './TransportControls';
import VolumeControl from './VolumeControl';
import { formatDuration, formatPosition } from '../../lib/format';
import { CloseIcon } from './icons';

const MUTED_TEXT = 'rgba(248,250,252,0.6)';

interface NowPlayingOverlayProps {
  onClose: () => void;
}

/**
 * Màn "Đang phát" toàn màn hình — mở bằng Fullscreen API thật của trình
 * duyệt (`element.requestFullscreen()`), không phải chỉ CSS phủ kín viewport,
 * để dùng được như màn phụ treo TV/tablet trong quán.
 *
 * Đồng bộ trạng thái qua sự kiện `fullscreenchange` thay vì chỉ dựa vào state
 * React: người dùng có thể thoát fullscreen bằng phím ESC/F11 của hệ điều
 * hành mà không đi qua nút Đóng của ta — nếu chỉ set state lúc bấm nút, state
 * React sẽ nghĩ vẫn đang mở trong khi trình duyệt đã thoát fullscreen thật,
 * kẹt UI ở giữa hai trạng thái.
 */
export default function NowPlayingOverlay({ onClose }: NowPlayingOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { current, durationMs } = usePlayer();
  const positionMs = usePlayerPosition();

  useEffect(() => {
    const element = containerRef.current;

    if (element && document.fullscreenElement !== element) {
      // Một số trình duyệt/thiết bị từ chối hoặc không hỗ trợ (vd Safari cũ) —
      // vẫn hiện overlay dạng phủ kín màn hình bằng CSS `fixed inset-0`, chỉ
      // là không có fullscreen thật của hệ điều hành.
      void element.requestFullscreen?.().catch(() => {});
    }

    const handleFullscreenChange = () => {
      if (document.fullscreenElement !== element) onClose();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (document.fullscreenElement === element) {
        void document.exitFullscreen?.().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy một lần lúc mount/unmount
  }, []);

  const handleClose = useCallback(() => {
    if (document.fullscreenElement) {
      // `fullscreenchange` sẽ tự gọi onClose sau khi trình duyệt thoát xong.
      void document.exitFullscreen?.().catch(() => onClose());
      return;
    }
    onClose();
  }, [onClose]);

  if (!current) return null;

  const progressPct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  return (
    <div
      ref={containerRef}
      className="animate-slide-up fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 p-8"
      style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Đang phát toàn màn hình"
    >
      <button
        onClick={handleClose}
        className="absolute top-6 right-6 p-2 rounded-full cursor-pointer transition-opacity duration-[var(--duration-base)] hover:opacity-80 focus-visible:outline-none"
        style={{ color: 'var(--color-foreground)' }}
        aria-label="Đóng toàn màn hình"
      >
        <CloseIcon />
      </button>

      <CoverArt seed={current.id} label={current.title} size={320} />

      <div className="text-center w-full max-w-md">
        <MarqueeText text={current.title} className="text-2xl font-semibold" />
        {current.artist && (
          <p className="text-base mt-2 truncate" style={{ color: MUTED_TEXT }}>
            {current.artist}
          </p>
        )}
      </div>

      <div className="w-full max-w-md flex flex-col gap-2">
        <div
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Tiến trình bài hát"
          className="w-full h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--color-muted)' }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              backgroundColor: 'var(--color-accent)',
            }}
          />
        </div>
        <div className="flex justify-between text-xs tabular-nums" style={{ color: MUTED_TEXT }}>
          <span>{formatPosition(positionMs)}</span>
          <span>{formatDuration(durationMs)}</span>
        </div>
      </div>

      <TransportControls size="lg" />

      <VolumeControl />
    </div>
  );
}
