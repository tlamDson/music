'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { useStoresSync } from '../sync/StoresSyncBridge';
import CoverArt from '../media/CoverArt';
import StorePlaylistTracks from './StorePlaylistTracks';
import { formatTotalDuration } from '../../lib/format';
import type { ApiResponse, NowPlayingSnapshot } from '@cafe-music/shared';

interface StoreDetailData {
  id: string;
  name: string;
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
  nowPlaying: NowPlayingSnapshot | null;
  connectedScreens: number;
}

interface PlaylistRow {
  id: string;
  name: string;
  scope: 'ORG' | 'STORE';
  _count?: { playlistTracks: number };
  totalDurationMs?: number;
}

const REFRESH_MS = 10_000;

/**
 * Trang điều khiển nhạc của **một quán** — chỗ duy nhất phát được nhạc ra loa
 * quán sau khi bỏ tầng sync group. `/dashboard/playlists` chỉ để nghe thử.
 *
 * Trước PR này, playlist chỉ có một nút "phát từ bài đầu" và trang phải chờ
 * tới 10 giây poll (`GET /stores/:id`) mới thấy đổi bài. Giờ playlist đang
 * phát hiện luôn danh sách bài (`StorePlaylistTracks`), playlist chưa phát
 * bung được tại chỗ, và `StoresSyncBridge` (socket đã mở sẵn ở dashboard
 * layout cho mọi quán) báo hiệu đổi bài để refetch ngay — 10s poll vẫn giữ
 * làm phao cứu sinh khi socket rớt.
 */
export default function StoreDetail({ storeId }: { storeId: string }) {
  const [store, setStore] = useState<StoreDetailData | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchStore = useCallback(async () => {
    try {
      setStore(await api.get<StoreDetailData>(`/stores/${storeId}`));
    } catch {
      setStore(null);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void fetchStore();

    api
      .get<ApiResponse<PlaylistRow[]>>('/playlists')
      .then((res) => setPlaylists(res.data))
      .catch(() => setPlaylists([]));
  }, [fetchStore]);

  useEffect(() => {
    // Nhạc đổi bài do server hẹn giờ, trang này không nghe WS của quán trực
    // tiếp — vẫn giữ làm phao cứu sinh khi bridge bên dưới rớt kết nối.
    const timer = setInterval(() => void fetchStore(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchStore]);

  // Bridge mở sẵn một socket cho mỗi quán của tổ chức (ở dashboard layout) —
  // đọc đúng quán đang xem để refetch ngay khi có đổi bài, không phải chờ
  // tới lần poll 10 giây kế tiếp.
  const bridgeState = useStoresSync(storeId);
  const isFirstBridgeUpdate = useRef(true);

  useEffect(() => {
    if (isFirstBridgeUpdate.current) {
      isFirstBridgeUpdate.current = false;
      return;
    }
    void fetchStore();
  }, [bridgeState, fetchStore]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      await fetchStore();
      toast.success(success);
    } catch (err) {
      // Hiện lỗi thật của backend thay vì đoán bừa — đoán sai che mất nguyên
      // nhân (playlist rỗng, track chưa có file, quán không thuộc tổ chức...).
      toast.error(err instanceof Error && err.message ? err.message : 'Thao tác thất bại');
    }
  };

  const playPlaylistFrom = (playlistId: string, trackIndex: number, name: string) =>
    run(
      () => api.post(`/sync/stores/${storeId}/play`, { playlistId, trackIndex }),
      `Đang phát "${name}" tại ${store?.name ?? 'quán'}`,
    );

  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Đang tải thông tin quán">
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-32 w-full" />
        <span className="sr-only">Đang tải thông tin quán...</span>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="flex flex-col gap-3 items-start">
        <p className="text-sm" style={{ color: 'var(--color-destructive)' }}>
          Không tải được quán này.
        </p>
        <Link
          href="/dashboard/stores"
          className="text-sm underline cursor-pointer"
          style={{ color: 'var(--color-secondary)' }}
        >
          Quay lại danh sách quán
        </Link>
      </div>
    );
  }

  const nowPlaying = store.nowPlaying;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/stores"
          className="text-xs uppercase tracking-wide cursor-pointer hover:brightness-125 transition-[filter] duration-[var(--duration-fast)] w-fit"
          style={{ color: 'var(--color-secondary)' }}
        >
          ← Quay lại danh sách quán
        </Link>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          {store.name}
        </h1>
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          {store.connectedScreens > 0
            ? `${store.connectedScreens} màn hình đang kết nối`
            : 'Chưa có màn hình nào kết nối — mở màn chiếu để nghe được nhạc'}
        </p>
      </div>

      {/* Đang phát + điều khiển */}
      <section
        className="p-5 rounded-xl flex flex-col gap-4"
        style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
      >
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Đang phát
        </h2>

        {nowPlaying ? (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <CoverArt seed={nowPlaying.track.id} label={nowPlaying.track.title} size={56} />
              <div className="min-w-0">
                <p
                  className="text-sm font-medium truncate"
                  style={{ color: 'var(--color-foreground)' }}
                >
                  {nowPlaying.track.title}
                </p>
                <p className="text-xs truncate" style={{ color: 'rgba(248,250,252,0.5)' }}>
                  {nowPlaying.track.artist ?? 'Chưa rõ nghệ sĩ'}
                  {nowPlaying.queue
                    ? ` · còn ${nowPlaying.queue.remaining} bài trong hàng chờ`
                    : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {nowPlaying.isPlaying ? (
                <button
                  onClick={() =>
                    void run(
                      () => api.post(`/sync/stores/${storeId}/pause`),
                      'Đã tạm dừng nhạc tại quán',
                    )
                  }
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-foreground)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  Tạm dừng
                </button>
              ) : (
                <button
                  onClick={() =>
                    void run(
                      () => api.post(`/sync/stores/${storeId}/resume`),
                      'Đã phát tiếp tại quán',
                    )
                  }
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                >
                  Phát tiếp
                </button>
              )}

              <button
                onClick={() =>
                  void run(() => api.post(`/sync/stores/${storeId}/next`), 'Đã chuyển bài')
                }
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-border)',
                }}
              >
                Bài sau
              </button>

              <button
                onClick={() =>
                  void run(() => api.post(`/sync/stores/${storeId}/stop`), 'Đã dừng nhạc tại quán')
                }
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--color-destructive)',
                  border: '1px solid var(--color-destructive)',
                }}
              >
                Dừng hẳn
              </button>
            </div>

            {/* Danh sách bài của playlist đang phát — bấm bài nào là nhảy
                ngay tới bài đó, trước đây phải rời sang trang chi tiết playlist. */}
            <div
              className="rounded-xl overflow-hidden py-2"
              style={{
                backgroundColor: 'var(--color-background)',
                border: '1px solid var(--color-border)',
              }}
            >
              <StorePlaylistTracks
                playlistId={nowPlaying.playlistId}
                onPlayTrack={(trackIndex, name) =>
                  void playPlaylistFrom(nowPlaying.playlistId, trackIndex, name)
                }
              />
            </div>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Quán đang im lặng — chọn một playlist bên dưới để phát.
          </p>
        )}
      </section>

      {/* Playlist để phát cho quán */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Phát cho quán này
        </h2>

        {playlists.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Chưa có playlist nào.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {playlists.map((playlist, index) => {
              const isCurrentPlaylist = playlist.id === nowPlaying?.playlistId;
              const isExpanded = expandedId === playlist.id;
              const staggered = index < 8;

              return (
                <li
                  key={playlist.id}
                  className={`flex flex-col rounded-xl transition-colors duration-[var(--duration-base)] ${
                    staggered ? 'animate-stagger-item' : ''
                  }`}
                  style={{
                    backgroundColor: 'var(--color-muted)',
                    border: `1px solid ${
                      isCurrentPlaylist ? 'var(--color-accent)' : 'var(--color-border)'
                    }`,
                    ...(staggered ? ({ '--i': index } as React.CSSProperties) : {}),
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
                          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-125 focus-visible:outline-none focus-visible:ring-2"
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
                            className="w-4 h-4 transition-transform duration-[var(--duration-base)]"
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
                        onClick={() => void playPlaylistFrom(playlist.id, 0, playlist.name)}
                        className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center cursor-pointer transition-[filter] duration-[var(--duration-base)] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
                        style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                        aria-label={`Phát ${playlist.name} tại ${store.name}`}
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
                          void playPlaylistFrom(playlist.id, trackIndex, name)
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

      {/* Màn hình của quán */}
      <section className="flex flex-wrap gap-3">
        <a
          href={`/player/${storeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
        >
          Mở màn hình quán
        </a>
        <a
          href={`/player/${storeId}?kiosk=1`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--color-secondary)',
            border: '1px solid var(--color-border)',
          }}
        >
          Màn chiếu TV
        </a>
      </section>
    </div>
  );
}
