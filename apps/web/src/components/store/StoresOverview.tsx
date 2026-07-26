'use client';

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
      <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
        Đang tải trạng thái các quán...
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
        Chưa có quán nào.
      </p>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {rows.map((row) => (
        <Link
          key={row.storeId}
          href={`/dashboard/stores/${row.storeId}`}
          className="w-64 flex-shrink-0 p-4 rounded-xl flex flex-col gap-3 cursor-pointer transition-all duration-150 hover:brightness-125 focus-visible:outline-none focus-visible:brightness-125"
          style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
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
              <p className="text-xs truncate" style={{ color: 'rgba(248,250,252,0.5)' }}>
                {row.connectedScreens > 0
                  ? `${row.connectedScreens} màn hình đang kết nối`
                  : 'Chưa có màn hình nào'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: row.isPlaying ? 'var(--color-accent)' : 'rgba(248,250,252,0.25)',
              }}
              aria-hidden="true"
            />
            <span className="text-xs" style={{ color: 'rgba(248,250,252,0.6)' }}>
              {row.isPlaying
                ? 'Đang phát'
                : row.status === 'PAUSED'
                  ? 'Tạm dừng'
                  : 'Đang im lặng'}
            </span>
          </div>

          {row.queueRemaining !== null && (
            <span
              className="text-xs px-2 py-1 rounded-full self-start"
              style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: 'var(--color-accent)' }}
            >
              Còn {row.queueRemaining} bài trong hàng chờ
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
