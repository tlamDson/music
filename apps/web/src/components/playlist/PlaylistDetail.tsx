'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { formatDuration, formatTotalDuration } from '../../lib/format';
import { usePlayer } from '../player/PlayerProvider';
import CoverArt from '../media/CoverArt';
import AddTrackDialog from './AddTrackDialog';
import type { Playlist, Track, UserRole } from '@cafe-music/shared';

interface PlaylistTrackRow {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
  track: Track;
}

interface PlaylistDetailData extends Omit<Playlist, 'trackCount'> {
  playlistTracks: PlaylistTrackRow[];
}

interface PlaylistDetailProps {
  playlistId: string;
  role: UserRole;
  storeId: string | null;
  backHref: string;
}

export default function PlaylistDetail({
  playlistId,
  role,
  storeId,
  backHref,
}: PlaylistDetailProps) {
  const [playlist, setPlaylist] = useState<PlaylistDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { current, isPlaying, queue, playTrack } = usePlayer();

  const isStore = role === 'STORE_ADMIN';

  const fetchPlaylist = useCallback(async () => {
    try {
      setPlaylist(await api.get<PlaylistDetailData>(`/playlists/${playlistId}`));
    } catch {
      toast.error('Không tải được playlist');
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    void fetchPlaylist();
  }, [fetchPlaylist]);

  const rows = playlist?.playlistTracks ?? [];
  const totalDurationMs = rows.reduce((sum, row) => sum + (row.track.durationMs ?? 0), 0);

  /**
   * Quán bấm phát = phát thật ra loa quán. Admin chuỗi bấm phát = **nghe thử
   * tại chỗ**, chỉ tab đang bấm nghe được — muốn phát ra quán thì vào
   * `/dashboard/stores/[id]`, nơi chọn đúng quán để phát.
   */
  const playFrom = async (trackIndex: number) => {
    try {
      if (isStore) {
        if (!storeId) {
          toast.error('Tài khoản chưa gắn với quán nào');
          return;
        }
        await api.post(`/sync/stores/${storeId}/play`, { playlistId, trackIndex });
        toast.success('Đang phát tại quán');
        return;
      }

      const track = rows[trackIndex]?.track;
      if (!track) {
        toast.error('Playlist chưa có bài nào');
        return;
      }

      const { url } = await api.get<{ url: string }>(`/tracks/${track.id}/stream-url`);
      playTrack(
        {
          id: track.id,
          title: track.title,
          artist: track.artist,
          url,
          durationMs: track.durationMs,
        },
        { mode: 'preview' },
      );
      toast.success(`Nghe thử "${track.title}"`);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Phát thất bại');
    }
  };

  const addTrack = async (trackId: string, title: string) => {
    if (rows.some((row) => row.trackId === trackId)) {
      toast.error(`"${title}" đã có trong playlist`);
      return;
    }

    try {
      await api.post(`/playlists/${playlistId}/tracks`, { trackId });
      await fetchPlaylist();
      toast.success(`Đã thêm "${title}"`);
    } catch {
      toast.error(`Thêm "${title}" thất bại`);
    }
  };

  const removeTrack = async (trackId: string, title: string) => {
    try {
      await api.delete(`/playlists/${playlistId}/tracks/${trackId}`);
      setPlaylist((prev) =>
        prev
          ? { ...prev, playlistTracks: prev.playlistTracks.filter((r) => r.trackId !== trackId) }
          : prev,
      );
      toast.success(`Đã xóa "${title}"`);
    } catch {
      toast.error(`Xóa "${title}" thất bại`);
    }
  };

  // Kéo từ kho nhạc thả vào danh sách
  const handleLibraryDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const trackId = e.dataTransfer.getData('trackId');
    if (!trackId || dragIndex !== null) return;

    void addTrack(trackId, trackId);
  };

  // Kéo thả trong danh sách để đổi thứ tự phát
  const handleReorderDrop = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex || !playlist) return;

    const next = [...playlist.playlistTracks];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);

    setPlaylist({ ...playlist, playlistTracks: next });
    setDragIndex(null);

    try {
      await api.patch(`/playlists/${playlistId}/tracks/reorder`, {
        trackIds: next.map((row) => row.trackId),
      });
      toast.success('Đã cập nhật thứ tự phát');
    } catch {
      toast.error('Cập nhật thứ tự thất bại');
      void fetchPlaylist();
    }
  };

  if (loading) {
    return (
      <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
        Đang tải...
      </p>
    );
  }

  if (!playlist) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-destructive)' }}>
        Không tìm thấy playlist.
      </p>
    );
  }

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-end gap-6">
          <Link
            href={backHref}
            className="self-start p-2 rounded-lg cursor-pointer transition-all duration-150 hover:brightness-125 focus-visible:outline-none"
            style={{ color: 'var(--color-foreground)', border: '1px solid var(--color-border)' }}
            aria-label="Quay lại danh sách playlist"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>

          <CoverArt seed={playlist.id} label={playlist.name} size={176} />

          <div className="min-w-0 pb-1">
            <p
              className="text-xs uppercase tracking-wide"
              style={{ color: 'rgba(248,250,252,0.6)' }}
            >
              {playlist.scope === 'ORG' ? 'Danh sách phát của chuỗi' : 'Danh sách phát của quán'}
            </p>
            <h1
              className="text-3xl font-bold mt-2 truncate"
              style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
            >
              {playlist.name}
            </h1>
            <p className="text-sm mt-3" style={{ color: 'rgba(248,250,252,0.6)' }}>
              {rows.length} bài · {formatTotalDuration(totalDurationMs)}
            </p>
          </div>
        </div>

        {/* Hàng điều khiển */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => void playFrom(0)}
            className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:brightness-110 focus-visible:outline-none"
            style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
            aria-label="Phát playlist"
          >
            <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor" aria-hidden="true">
              <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
            </svg>
          </button>

          <button
            onClick={() => setDialogOpen(true)}
            className="px-4 py-2 rounded-full text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-125 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          >
            Thêm bài hát
          </button>
        </div>

        {/* Bảng track */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleLibraryDrop}
          aria-label="Danh sách bài hát"
          className="rounded-xl transition-all duration-200"
          style={{
            border: `1px ${dragOver ? 'dashed' : 'solid'} ${
              dragOver ? 'var(--color-accent)' : 'var(--color-border)'
            }`,
            backgroundColor: dragOver ? 'rgba(34,197,94,0.05)' : 'transparent',
          }}
        >
          {rows.length === 0 ? (
            <p className="text-sm p-8 text-center" style={{ color: 'rgba(248,250,252,0.5)' }}>
              Chưa có bài nào — bấm &quot;Thêm bài hát&quot; hoặc kéo từ kho nhạc vào đây.
            </p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th
                    className="w-12 px-4 py-2 text-xs font-normal"
                    style={{ color: 'rgba(248,250,252,0.5)' }}
                  >
                    #
                  </th>
                  <th
                    className="px-2 py-2 text-xs font-normal"
                    style={{ color: 'rgba(248,250,252,0.5)' }}
                  >
                    Tiêu đề
                  </th>
                  <th
                    className="w-24 px-4 py-2 text-xs font-normal text-right"
                    style={{ color: 'rgba(248,250,252,0.5)' }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4 inline-block"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path strokeLinecap="round" d="M12 7v5l3 2" />
                    </svg>
                    <span className="sr-only">Thời lượng</span>
                  </th>
                  <th className="w-24 px-4 py-2" aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const isCurrent = current?.id === row.trackId && isPlaying;

                  return (
                    <tr
                      key={row.trackId}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.stopPropagation();
                        void handleReorderDrop(index);
                      }}
                      className="group cursor-grab active:cursor-grabbing transition-all duration-150 hover:brightness-125"
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        opacity: dragIndex === index ? 0.5 : 1,
                        backgroundColor: isCurrent ? 'rgba(34,197,94,0.08)' : 'transparent',
                      }}
                    >
                      <td
                        className="px-4 py-3 text-sm tabular-nums"
                        style={{
                          color: isCurrent ? 'var(--color-accent)' : 'rgba(248,250,252,0.5)',
                        }}
                      >
                        {index + 1}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <CoverArt seed={row.trackId} label={row.track.title} size={40} />
                          <div className="min-w-0">
                            <p
                              className="text-sm font-medium truncate"
                              style={{
                                color: isCurrent
                                  ? 'var(--color-accent)'
                                  : 'var(--color-foreground)',
                              }}
                            >
                              {row.track.title}
                            </p>
                            {row.track.artist && (
                              <p
                                className="text-xs truncate"
                                style={{ color: 'rgba(248,250,252,0.5)' }}
                              >
                                {row.track.artist}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 text-sm text-right tabular-nums"
                        style={{ color: 'rgba(248,250,252,0.5)' }}
                      >
                        {formatDuration(row.track.durationMs)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => void playFrom(index)}
                            className="p-2 rounded cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
                            style={{ color: 'var(--color-accent)' }}
                            aria-label={`Phát ${row.track.title}`}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="w-4 h-4"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => void removeTrack(row.trackId, row.track.title)}
                            className="p-2 rounded cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
                            style={{ color: 'var(--color-destructive)' }}
                            aria-label={`Xóa ${row.track.title}`}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Panel phải: đang phát + hàng chờ */}
      <aside
        className="hidden xl:flex w-72 flex-shrink-0 flex-col gap-4 p-4 rounded-xl h-fit"
        style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
        aria-label="Đang phát"
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Đang phát
        </h2>

        {current ? (
          <>
            <CoverArt seed={current.id} label={current.title} size={240} className="w-full" />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                {current.title}
              </p>
              {current.artist && (
                <p className="text-xs mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
                  {current.artist}
                </p>
              )}
            </div>
            {queue && (
              <p className="text-xs" style={{ color: 'var(--color-accent)' }}>
                Còn {queue.remaining} bài trong hàng chờ
              </p>
            )}
          </>
        ) : (
          <p className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Chưa phát bài nào.
          </p>
        )}
      </aside>

      <AddTrackDialog
        open={dialogOpen}
        existingTrackIds={rows.map((row) => row.trackId)}
        onAdd={(trackId, title) => void addTrack(trackId, title)}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
