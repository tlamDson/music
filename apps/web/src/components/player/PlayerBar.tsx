'use client';

import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { formatDuration, formatPosition } from '../../lib/format';
import { usePlayer } from './PlayerProvider';

const MUTED_TEXT = 'rgba(248,250,252,0.6)';

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M6 5.14v13.72a1 1 0 001.5.86l9-5.62V18a1 1 0 002 0V6a1 1 0 10-2 0v3.9l-9-5.62A1 1 0 006 5.14z" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5L6 9H3v6h3l5 4V5zM16 9a4 4 0 010 6"
      />
    </svg>
  );
}

/**
 * Thanh phát cố định dưới cùng, hiện xuyên suốt mọi trang. Ẩn hẳn khi chưa có
 * gì phát để không chiếm chỗ ở màn hình đăng nhập.
 */
export default function PlayerBar() {
  const {
    current,
    isPlaying,
    positionMs,
    durationMs,
    volume,
    mode,
    storeId,
    queue,
    toggle,
    seek,
    changeVolume,
  } = usePlayer();

  const pathname = usePathname();

  // Màn chiếu treo TV (`/player/[storeId]`) chỉ để nhìn — thanh phát có nút bấm
  // không được xuất hiện ở đó, kể cả khi provider đang phát nhạc.
  if (pathname?.startsWith('/player/')) return null;
  if (!current) return null;

  const progressPct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;
  const isStoreQueue = mode === 'local' && storeId !== null;

  const handleNext = async () => {
    if (!storeId) return;
    try {
      await api.post(`/sync/stores/${storeId}/next`);
    } catch {
      toast.error('Không chuyển được bài');
    }
  };

  const handleRejoin = async () => {
    if (!storeId) return;
    try {
      await api.post(`/sync/stores/${storeId}/rejoin`);
      toast.success('Đã quay lại nhóm sync');
    } catch {
      toast.error('Quay lại nhóm sync thất bại');
    }
  };

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-6"
      style={{
        backgroundColor: 'var(--color-muted)',
        borderTop: '1px solid var(--color-border)',
      }}
      aria-label="Trình phát nhạc"
    >
      {/* Bài đang phát */}
      <div className="flex items-center gap-3 min-w-0 md:w-64">
        <div
          className="w-11 h-11 rounded flex-shrink-0 flex items-center justify-center"
          style={{ backgroundColor: 'var(--color-primary)' }}
          aria-hidden="true"
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
            {current.title.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
            {current.title}
          </p>
          {current.artist && (
            <p className="text-xs truncate" style={{ color: MUTED_TEXT }}>
              {current.artist}
            </p>
          )}
        </div>
      </div>

      {/* Điều khiển + tiến trình */}
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggle}
            className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:opacity-90 focus-visible:outline-none"
            style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
            aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {isStoreQueue && (
            <button
              onClick={() => void handleNext()}
              className="p-2 rounded-full cursor-pointer transition-all duration-200 hover:opacity-80 focus-visible:outline-none"
              style={{ color: 'var(--color-foreground)' }}
              aria-label="Bài kế tiếp"
            >
              <NextIcon />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums" style={{ color: MUTED_TEXT }}>
            {formatPosition(positionMs)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(durationMs, 1)}
            value={Math.min(positionMs, durationMs)}
            onChange={(e) => seek(Number(e.target.value))}
            className="flex-1 h-1 cursor-pointer accent-[var(--color-accent)]"
            role="progressbar"
            aria-valuenow={Math.round(progressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tiến trình bài hát"
          />
          <span className="text-xs tabular-nums" style={{ color: MUTED_TEXT }}>
            {formatDuration(durationMs)}
          </span>
        </div>
      </div>

      {/* Hàng chờ riêng của quán + âm lượng */}
      <div className="flex items-center justify-between gap-4 md:w-72 md:justify-end">
        {isStoreQueue && queue && (
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="text-xs px-2 py-1 rounded-full whitespace-nowrap"
              style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: 'var(--color-accent)' }}
            >
              Còn {queue.remaining} bài
            </span>
            <button
              onClick={() => void handleRejoin()}
              className="text-xs underline cursor-pointer transition-all duration-150 hover:opacity-80 focus-visible:outline-none whitespace-nowrap"
              style={{ color: 'var(--color-secondary)' }}
              aria-label="Quay lại nhóm sync"
            >
              Quay lại nhóm sync
            </button>
          </div>
        )}

        <div className="flex items-center gap-2" style={{ color: MUTED_TEXT }}>
          <VolumeIcon />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="w-20 h-1 cursor-pointer accent-[var(--color-accent)]"
            aria-label="Âm lượng"
          />
        </div>
      </div>
    </footer>
  );
}
