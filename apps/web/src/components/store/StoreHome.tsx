'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { useStoreSync } from '../sync/StoreSyncProvider';
import { useClockOffset } from '../../hooks/useClockOffset';
import { usePlayer } from '../player/PlayerProvider';
import CoverArt from '../media/CoverArt';
import StorePlaylistTracks from './StorePlaylistTracks';
import { formatTotalDuration } from '../../lib/format';
import type { ApiResponse } from '@cafe-music/shared';

interface StoreStatus {
  storeId: string;
  name: string;
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
  connectedScreens: number;
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
 *
 * Trước PR này mỗi playlist chỉ có một nút "phát từ bài đầu" — muốn xem có
 * bài gì hay bắt đầu từ giữa playlist phải rời sang trang chi tiết playlist.
 * Giờ playlist đang phát hiện luôn danh sách bài (`StorePlaylistTracks`), và
 * playlist chưa phát bung được tại chỗ để chọn bài bắt đầu.
 */
export default function StoreHome({ storeId }: { storeId: string }) {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [playlists, setPlaylists] = useState<SuggestedPlaylist[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { offset, measureOffset } = useClockOffset();
  // Socket do `StoreSyncProvider` ở layout giữ — trang này chỉ đọc trạng thái.
  const { isConnected, storeQueue, playlistId } = useStoreSync();
  const { current, isPlaying } = usePlayer();

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.get<StoreStatus>(`/stores/${storeId}/status`));
    } catch {
      setStatus(null);
    }
  }, [storeId]);

  useEffect(() => {
    void measureOffset();
  }, [measureOffset]);

  useEffect(() => {
    void refreshStatus();

    api
      .get<ApiResponse<SuggestedPlaylist[]>>('/playlists')
      .then((res) => setPlaylists(res.data))
      .catch(() => setPlaylists([]));
  }, [refreshStatus]);

  const playFrom = async (targetPlaylistId: string, trackIndex: number, name: string) => {
    try {
      await api.post(`/sync/stores/${storeId}/play`, {
        playlistId: targetPlaylistId,
        trackIndex,
      });
      await refreshStatus();
      toast.success(`Đang phát "${name}" tại quán`);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Phát thất bại');
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
              ? `${isPlaying ? 'Đang phát' : 'Tạm dừng'} tại quán`
              : 'Quán đang im lặng — chọn playlist bên dưới để phát'}
          </p>
        </div>

        {storeQueue && (
          <span
            className="text-xs px-3 py-1 rounded-full whitespace-nowrap"
            style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: 'var(--color-accent)' }}
          >
            Còn {storeQueue.remaining} bài trong hàng chờ
          </span>
        )}
      </div>

      {/* Đang phát: danh sách bài của playlist đang chạy, bấm bài nào là nhảy
          ngay tới bài đó — trước đây phải rời sang trang chi tiết playlist. */}
      {playlistId && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
            Đang phát
          </h2>
          <div
            className="rounded-xl overflow-hidden py-2"
            style={{
              backgroundColor: 'var(--color-muted)',
              border: '1px solid var(--color-border)',
            }}
          >
            <StorePlaylistTracks
              playlistId={playlistId}
              onPlayTrack={(trackIndex, name) => void playFrom(playlistId, trackIndex, name)}
            />
          </div>
        </section>
      )}

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
            {playlists.map((playlist) => {
              const isCurrentPlaylist = playlist.id === playlistId;
              const isExpanded = expandedId === playlist.id;

              return (
                <li
                  key={playlist.id}
                  className="flex flex-col rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: 'var(--color-muted)',
                    border: `1px solid ${
                      isCurrentPlaylist ? 'var(--color-accent)' : 'var(--color-border)'
                    }`,
                  }}
                >
                  <div className="flex items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CoverArt seed={playlist.id} label={playlist.name} size={44} />
                      <div className="min-w-0">
                        <p
                          className="text-sm font-medium truncate flex items-center gap-2"
                          style={{ color: 'var(--color-foreground)' }}
                        >
                          <span className="truncate">{playlist.name}</span>
                          {isCurrentPlaylist && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: 'rgba(34,197,94,0.15)',
                                color: 'var(--color-accent)',
                              }}
                            >
                              Đang phát
                            </span>
                          )}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'rgba(248,250,252,0.5)' }}>
                          {playlist._count?.playlistTracks ?? 0} bài ·{' '}
                          {formatTotalDuration(playlist.totalDurationMs)} ·{' '}
                          {playlist.scope === 'ORG' ? 'của chuỗi' : 'của quán'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isCurrentPlaylist && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : playlist.id)}
                          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2"
                          style={{ color: 'var(--color-foreground)' }}
                          aria-label={
                            isExpanded
                              ? `Thu gọn danh sách bài của ${playlist.name}`
                              : `Xem danh sách bài của ${playlist.name}`
                          }
                          aria-expanded={isExpanded}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4 transition-transform duration-200"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }}
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                          </svg>
                        </button>
                      )}

                      <button
                        onClick={() => void playFrom(playlist.id, 0, playlist.name)}
                        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center cursor-pointer transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
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
                    </div>
                  </div>

                  {isExpanded && !isCurrentPlaylist && (
                    <div className="px-3 pb-3">
                      <StorePlaylistTracks
                        playlistId={playlist.id}
                        onPlayTrack={(trackIndex, name) =>
                          void playFrom(playlist.id, trackIndex, name)
                        }
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
