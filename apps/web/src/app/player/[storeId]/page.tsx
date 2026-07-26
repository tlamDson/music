'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useSync } from '../../../hooks/useSync';
import { useClockOffset } from '../../../hooks/useClockOffset';
import { usePlayer, usePlayerPosition } from '../../../components/player/PlayerProvider';
import { api } from '../../../lib/api-client';
import { formatPosition } from '../../../lib/format';
import CoverArt from '../../../components/media/CoverArt';

/**
 * Màn hình phát của quán. Mặc định có vài nút điều khiển cho người mở từ trang
 * Quán; thêm `?kiosk=1` khi treo lên TV để chỉ còn phần hiển thị — nhân viên
 * lau bàn không bấm nhầm được.
 *
 * Nhạc đi qua thẻ audio dùng chung (`PlayerProvider`) như mọi trang khác, không
 * tự `new Audio()` để tránh hai nguồn nhạc phát chồng lên nhau.
 */
export default function PlayerPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const searchParams = useSearchParams();
  const isKiosk = searchParams.get('kiosk') === '1';

  const [token, setToken] = useState<string | null>(null);

  const { offset, measureOffset } = useClockOffset();
  const { isConnected, storeQueue } = useSync({ storeId, token, clockOffset: offset });
  const { current, isPlaying, durationMs, mode, pause } = usePlayer();
  // Vị trí phát đọc riêng qua usePlayerPosition() — cập nhật bằng rAF nhiều
  // lần/giây nhưng chỉ re-render đúng màn hình này, không kéo theo usePlayer().
  const positionMs = usePlayerPosition();

  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
    void measureOffset();
  }, [measureOffset]);

  const progressPct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  const handlePause = async () => {
    // Quán chưa có state trên server (đang nghe thử chẳng hạn) thì
    // POST /sync/stores/:id/pause sẽ 404 — dừng cục bộ là đủ.
    if (mode !== 'store') {
      pause();
      return;
    }

    try {
      await api.post(`/sync/stores/${storeId}/pause`);
    } catch {
      toast.error('Tạm dừng thất bại');
    }
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-6 p-8"
      style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
    >
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1
            className="text-lg font-semibold"
            style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
          >
            Cafe Music
          </h1>
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{
              backgroundColor: isConnected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: isConnected ? 'var(--color-accent)' : 'var(--color-destructive)',
            }}
          >
            {isConnected ? 'Đã kết nối' : 'Mất kết nối'}
          </span>
        </div>

        <CoverArt
          seed={current?.id ?? storeId}
          label={current?.title ?? 'Cafe Music'}
          size={384}
          className="w-full aspect-square"
        />

        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
            {current ? current.title : 'Chưa phát bài nào'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
            {storeQueue
              ? `Còn ${storeQueue.remaining} bài trong hàng chờ`
              : isPlaying
                ? 'Đang phát'
                : 'Đang chờ tín hiệu từ máy chủ'}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-valuenow={Math.round(progressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tiến trình bài hát"
            className="w-full rounded-full overflow-hidden"
            style={{ height: 4, backgroundColor: 'var(--color-muted)' }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'var(--color-accent)',
                // scaleX thay vì animate `width`: `width` là layout property,
                // đổi mỗi frame rAF sẽ gây reflow liên tục. transform không
                // kéo theo layout, chỉ composite — mượt hơn nhiều ở tần suất
                // cập nhật cao. Token động từ globals.css thay vì số rời.
                transform: `scaleX(${progressPct / 100})`,
                transformOrigin: 'left',
                transition: 'transform var(--duration-base) var(--ease-standard)',
              }}
            />
          </div>
          <div
            className="flex justify-between text-xs tabular-nums"
            style={{ color: 'rgba(248,250,252,0.5)' }}
          >
            <span>{formatPosition(positionMs)}</span>
            <span>{formatPosition(durationMs)}</span>
          </div>
        </div>

        {!isKiosk && (
          <button
            onClick={() => void handlePause()}
            className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
            aria-label="Tạm dừng"
          >
            Tạm dừng
          </button>
        )}
      </div>
    </main>
  );
}
