'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { formatDuration, formatPosition } from '../../lib/format';
import { usePlayer, usePlayerPosition } from './PlayerProvider';
import CoverArt from '../media/CoverArt';
import MarqueeText from './MarqueeText';
import TransportControls from './TransportControls';
import VolumeControl from './VolumeControl';
import NowPlayingOverlay from './NowPlayingOverlay';
import { ExpandIcon } from './icons';

const MUTED_TEXT = 'rgba(248,250,252,0.6)';

/**
 * Thanh phát cố định dưới cùng, hiện xuyên suốt mọi trang. Ẩn hẳn khi chưa có
 * gì phát để không chiếm chỗ ở màn hình đăng nhập.
 *
 * Bố cục theo tham chiếu Spotify: trái = bài đang phát, giữa = cụm điều khiển
 * + tiến trình, phải = hàng chờ/toàn màn hình/âm lượng.
 */
export default function PlayerBar() {
  const { current, durationMs, mode, storeId, queue, seek } = usePlayer();
  // Vị trí phát đọc riêng qua usePlayerPosition() — tách khỏi usePlayer() để
  // rAF cập nhật vài chục lần/giây không kéo theo re-render của mọi consumer
  // khác của usePlayer() (bảng track, nút play,...).
  const positionMs = usePlayerPosition();
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);

  const pathname = usePathname();

  // Màn chiếu treo TV (`/player/[storeId]`) chỉ để nhìn — thanh phát có nút bấm
  // không được xuất hiện ở đó, kể cả khi provider đang phát nhạc.
  if (pathname?.startsWith('/player/')) return null;
  if (!current) return null;

  const progressPct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;
  const isStoreQueue = mode === 'store' && storeId !== null;

  return (
    <>
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
          <CoverArt seed={current.id} label={current.title} size={44} />
          <div className="min-w-0">
            <MarqueeText text={current.title} className="text-sm font-medium" />
            {current.artist && (
              <p className="text-xs truncate" style={{ color: MUTED_TEXT }}>
                {current.artist}
              </p>
            )}
          </div>
        </div>

        {/* Điều khiển + tiến trình */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <TransportControls />

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

        {/* Hàng chờ của quán + toàn màn hình + âm lượng */}
        <div className="flex items-center justify-between gap-3 md:w-80 md:justify-end">
          {isStoreQueue && queue && (
            <span
              className="text-xs px-2 py-1 rounded-full whitespace-nowrap"
              style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: 'var(--color-accent)' }}
            >
              Còn {queue.remaining} bài
            </span>
          )}

          <button
            onClick={() => setIsOverlayOpen(true)}
            className="p-2 rounded-full cursor-pointer transition-opacity duration-[var(--duration-base)] hover:opacity-80 focus-visible:outline-none flex-shrink-0"
            style={{ color: MUTED_TEXT }}
            aria-label="Xem toàn màn hình"
            title="Xem toàn màn hình"
          >
            <ExpandIcon />
          </button>

          <VolumeControl />
        </div>
      </footer>

      {isOverlayOpen && <NowPlayingOverlay onClose={() => setIsOverlayOpen(false)} />}
    </>
  );
}
