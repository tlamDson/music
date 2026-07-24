'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { useSync } from '../../hooks/useSync';
import { useClockOffset } from '../../hooks/useClockOffset';
import { usePlayer } from '../player/PlayerProvider';
import CoverArt from '../media/CoverArt';
import { formatTotalDuration } from '../../lib/format';
import type { ApiResponse } from '@cafe-music/shared';

interface StoreStatus {
  storeId: string;
  name: string;
  syncGroupId: string | null;
  override: { isOverridden: boolean; overriddenAt: string | null } | null;
}

interface SuggestedPlaylist {
  id: string;
  name: string;
  scope: 'ORG' | 'STORE';
  _count?: { playlistTracks: number };
  totalDurationMs?: number;
}

/**
 * Màn hình nhân viên quán nhìn hằng ngày: đang nghe theo chuỗi hay đang phát
 * nhạc riêng, còn mấy bài nữa thì tự quay lại, và danh sách playlist bấm phát.
 */
export default function StoreHome({ storeId }: { storeId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [playlists, setPlaylists] = useState<SuggestedPlaylist[]>([]);

  const { offset, measureOffset } = useClockOffset();
  const { isConnected, storeQueue } = useSync({ storeId, token, clockOffset: offset });
  const { current, isPlaying } = usePlayer();

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.get<StoreStatus>(`/stores/${storeId}/status`));
    } catch {
      setStatus(null);
    }
  }, [storeId]);

  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
    void measureOffset();
  }, [measureOffset]);

  useEffect(() => {
    void refreshStatus();

    api
      .get<ApiResponse<SuggestedPlaylist[]>>('/playlists')
      .then((res) => setPlaylists(res.data))
      .catch(() => setPlaylists([]));
  }, [refreshStatus]);

  const isOverriding = Boolean(storeQueue) || Boolean(status?.override?.isOverridden);

  const handleRejoin = async () => {
    try {
      await api.post(`/sync/stores/${storeId}/rejoin`);
      await refreshStatus();
      toast.success('Đã quay lại nhóm sync');
    } catch {
      toast.error('Quay lại nhóm sync thất bại');
    }
  };

  const handlePlay = async (playlist: SuggestedPlaylist) => {
    try {
      await api.post(`/sync/stores/${storeId}/play`, {
        playlistId: playlist.id,
        trackIndex: 0,
        returnToGroupOnFinish: true,
      });
      await refreshStatus();
      toast.success(`Đang phát "${playlist.name}" tại quán`);
    } catch {
      toast.error('Phát thất bại — playlist có bài nào chưa?');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          {status?.name ?? 'Quán của tôi'}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Lệch đồng hồ với máy chủ: {offset > 0 ? '+' : ''}
          {offset}ms
        </p>
      </div>

      {/* Trạng thái kết nối + chế độ phát */}
      <div
        className="flex flex-wrap items-center gap-4 p-4 rounded-xl"
        style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{
            backgroundColor: isConnected ? 'var(--color-accent)' : 'var(--color-destructive)',
          }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
            {!isConnected
              ? 'Mất kết nối máy chủ — đang thử lại'
              : current
                ? current.title
                : 'Đã kết nối máy chủ'}
          </p>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(248,250,252,0.5)' }}>
            {current
              ? `${isPlaying ? 'Đang phát' : 'Tạm dừng'} · ${
                  isOverriding ? 'nhạc riêng của quán' : 'theo nhóm sync của chuỗi'
                }`
              : isOverriding
                ? 'Đang phát nhạc riêng của quán'
                : status?.syncGroupId
                  ? 'Đang theo nhóm sync của chuỗi'
                  : 'Quán chưa được gán nhóm sync nào'}
          </p>
        </div>

        {isOverriding && (
          <div className="flex items-center gap-3">
            {storeQueue && (
              <span
                className="text-xs px-3 py-1 rounded-full whitespace-nowrap"
                style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: 'var(--color-accent)' }}
              >
                Còn {storeQueue.remaining} bài · sau đó quay lại nhóm sync
              </span>
            )}
            <button
              onClick={() => void handleRejoin()}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
              style={{ backgroundColor: 'var(--color-secondary)', color: 'white' }}
            >
              Quay lại nhóm sync ngay
            </button>
          </div>
        )}
      </div>

      {/* Playlist bấm phát nhanh */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Phát tại quán
        </h2>

        {playlists.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Chưa có playlist nào.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {playlists.map((playlist) => (
              <li
                key={playlist.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl"
                style={{
                  backgroundColor: 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CoverArt seed={playlist.id} label={playlist.name} size={44} />
                  <div className="min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{ color: 'var(--color-foreground)' }}
                    >
                      {playlist.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'rgba(248,250,252,0.5)' }}>
                      {playlist._count?.playlistTracks ?? 0} bài ·{' '}
                      {formatTotalDuration(playlist.totalDurationMs)} ·{' '}
                      {playlist.scope === 'ORG' ? 'của chuỗi' : 'của quán'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => void handlePlay(playlist)}
                  className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center cursor-pointer transition-all duration-200 hover:brightness-110 focus-visible:outline-none"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                  aria-label={`Phát ${playlist.name}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="w-5 h-5"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
