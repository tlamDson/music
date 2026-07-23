'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import CoverArt from '../media/CoverArt';

interface StorePlaybackRow {
  storeId: string;
  name: string;
  syncGroupId: string | null;
  syncGroupName: string | null;
  isOverridden: boolean;
  trackId: string | null;
  isPlaying: boolean;
  queueRemaining: number | null;
}

const REFRESH_MS = 15_000;

/**
 * "Đang phát tại các quán" — admin nhìn một hàng là biết quán nào theo nhóm,
 * quán nào tách ra phát riêng và còn mấy bài nữa thì tự quay lại.
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

    // Trạng thái quán đổi do WS của chính quán, dashboard không nghe kênh đó
    const timer = setInterval(() => void fetchOverview(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchOverview]);

  const handleRejoin = async (row: StorePlaybackRow) => {
    try {
      await api.post(`/sync/stores/${row.storeId}/rejoin`);
      toast.success(`${row.name} đã quay lại nhóm sync`);
      await fetchOverview();
    } catch {
      toast.error('Kéo quán về nhóm thất bại');
    }
  };

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
        <div
          key={row.storeId}
          className="w-64 flex-shrink-0 p-4 rounded-xl flex flex-col gap-3"
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
                {row.syncGroupName ?? 'Chưa gán nhóm'}
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
              {row.isOverridden
                ? 'Đang phát nhạc riêng'
                : row.isPlaying
                  ? 'Đang phát theo nhóm'
                  : 'Đang im lặng'}
            </span>
          </div>

          {row.queueRemaining !== null && (
            <span
              className="text-xs px-2 py-1 rounded-full self-start"
              style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: 'var(--color-accent)' }}
            >
              Còn {row.queueRemaining} bài · rồi quay lại nhóm
            </span>
          )}

          {row.isOverridden && (
            <button
              onClick={() => void handleRejoin(row)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
              style={{ backgroundColor: 'var(--color-secondary)', color: 'white' }}
              aria-label={`Kéo ${row.name} về nhóm sync`}
            >
              Kéo về nhóm sync
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
