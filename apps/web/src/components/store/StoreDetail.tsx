'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import CoverArt from '../media/CoverArt';
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
 */
export default function StoreDetail({ storeId }: { storeId: string }) {
  const [store, setStore] = useState<StoreDetailData | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);

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
    // Nhạc đổi bài do server hẹn giờ, trang này không nghe WS của quán
    const timer = setInterval(() => void fetchStore(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchStore]);

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

  const playPlaylist = (playlist: PlaylistRow) =>
    run(
      () => api.post(`/sync/stores/${storeId}/play`, { playlistId: playlist.id, trackIndex: 0 }),
      `Đang phát "${playlist.name}" tại ${store?.name ?? 'quán'}`,
    );

  if (loading) {
    return (
      <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
        Đang tải thông tin quán...
      </p>
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
          className="text-xs uppercase tracking-wide cursor-pointer hover:brightness-125 transition-all duration-150 w-fit"
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
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
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
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                >
                  Phát tiếp
                </button>
              )}

              <button
                onClick={() =>
                  void run(() => api.post(`/sync/stores/${storeId}/next`), 'Đã chuyển bài')
                }
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
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
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--color-destructive)',
                  border: '1px solid var(--color-destructive)',
                }}
              >
                Dừng hẳn
              </button>
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
                  onClick={() => void playPlaylist(playlist)}
                  className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center cursor-pointer transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2"
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
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Màn hình của quán */}
      <section className="flex flex-wrap gap-3">
        <a
          href={`/player/${storeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110"
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
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110"
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
