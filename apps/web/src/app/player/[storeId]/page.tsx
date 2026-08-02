'use client';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations('player.kiosk');
  const tPlayer = useTranslations('player');
  const tCommon = useTranslations('common');
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
      toast.error(t('pauseFailed'));
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
              backgroundColor: isConnected ? 'var(--color-accent-soft-bg)' : 'rgba(239,68,68,0.15)',
              color: isConnected ? 'var(--color-accent)' : 'var(--color-destructive)',
            }}
          >
            {isConnected ? t('connected') : t('disconnected')}
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
            {current ? current.title : t('noTrack')}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--color-foreground-50)' }}>
            {storeQueue
              ? tCommon('queueRemaining', { count: storeQueue.remaining })
              : isPlaying
                ? tCommon('status.playing')
                : t('waitingForServer')}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <div
            role="progressbar"
            aria-valuenow={Math.round(progressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={tPlayer('progressLabel')}
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
                // cập nhật cao.
                transform: `scaleX(${progressPct / 100})`,
                transformOrigin: 'left',
                // 250ms linear khớp đúng chu kỳ ghi của usePlayerPosition()
                // (PlayerProvider tiết lưu rAF xuống ~4 lần/giây, xem
                // POSITION_TICK_INTERVAL_MS) — đây là nội suy giữa hai mốc dữ
                // liệu rời rạc, không phải transition phản hồi tương tác nên
                // không dùng token `--duration-base`/`--ease-standard`
                // (150–300ms, easing) của design system: `ease` sẽ làm thanh
                // chạy nhanh-chậm-nhanh giữa các bước thay vì trôi đều.
                transition: 'transform 250ms linear',
              }}
            />
          </div>
          <div
            className="flex justify-between text-xs tabular-nums"
            style={{ color: 'var(--color-foreground-50)' }}
          >
            <span>{formatPosition(positionMs)}</span>
            <span>{formatPosition(durationMs)}</span>
          </div>
        </div>

        {!isKiosk && (
          <button
            onClick={() => void handlePause()}
            className="w-full py-2 rounded-lg text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
            aria-label={tPlayer('transport.pause')}
          >
            {tPlayer('transport.pause')}
          </button>
        )}
      </div>
    </main>
  );
}
