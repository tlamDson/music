'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api-client';
import CoverArt from '../media/CoverArt';

interface StorePlaybackRow {
  storeId: string;
  name: string;
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
  trackId: string | null;
  isPlaying: boolean;
  queueRemaining: number | null;
  connectedScreens: number;
}

const REFRESH_MS = 15_000;

/**
 * "Đang phát tại các quán" — admin nhìn một hàng là biết quán nào đang có nhạc,
 * còn mấy bài trong hàng chờ và có màn hình nào đang nghe không.
 */
export default function StoresOverview() {
  const t = useTranslations('dashboard.overview');
  const tCommon = useTranslations('common');
  const [rows, setRows] = useState<StorePlaybackRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get<{ data: StorePlaybackRow[] }>('/sync/overview');
      setRows(res.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview();

    // Trạng thái đổi do server hẹn giờ chuyển bài, trang này không nghe WS
    const timer = setInterval(() => void fetchOverview(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchOverview]);

  if (loading) {
    return (
      <div
        className="flex flex-col gap-3 md:flex-row md:gap-4 md:overflow-x-auto md:pb-2"
        role="status"
        aria-label={t('loadingLabel')}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-28 w-full md:w-64 md:flex-shrink-0" />
        ))}
        <span className="sr-only">{t('loadingText')}</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-foreground-50)' }}>
        {t('empty')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 md:flex-row md:gap-4 md:overflow-x-auto md:pb-2">
      {rows.map((row, index) => (
        <Link
          key={row.storeId}
          href={`/dashboard/stores/${row.storeId}`}
          className={`w-full md:w-64 md:flex-shrink-0 p-4 rounded-xl flex flex-col gap-3 cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-125 focus-visible:outline-none focus-visible:brightness-125 ${
            index < 8 ? 'animate-stagger-item' : ''
          }`}
          style={{
            backgroundColor: 'var(--color-muted)',
            border: '1px solid var(--color-border)',
            ...(index < 8 ? ({ '--i': index } as React.CSSProperties) : {}),
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <CoverArt seed={row.storeId} label={row.name} size={44} />
            <div className="min-w-0">
              <p
                className="text-sm font-medium truncate"
                style={{ color: 'var(--color-foreground)' }}
              >
                {row.name}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--color-foreground-50)' }}>
                {row.connectedScreens > 0
                  ? t('connectedScreens', { count: row.connectedScreens })
                  : t('noScreens')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: row.isPlaying
                  ? 'var(--color-accent)'
                  : 'var(--color-foreground-25)',
              }}
              aria-hidden="true"
            />
            <span className="text-xs" style={{ color: 'var(--color-foreground-60)' }}>
              {row.isPlaying
                ? tCommon('status.playing')
                : row.status === 'PAUSED'
                  ? tCommon('status.paused')
                  : tCommon('status.stopped')}
            </span>
          </div>

          {row.queueRemaining !== null && (
            <span
              className="text-xs px-2 py-1 rounded-full self-start"
              style={{
                backgroundColor: 'var(--color-accent-soft-bg)',
                color: 'var(--color-accent)',
              }}
            >
              {tCommon('queueRemaining', { count: row.queueRemaining })}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
