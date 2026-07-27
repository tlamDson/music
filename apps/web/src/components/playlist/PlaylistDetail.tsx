'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { formatTotalDurationExact } from '../../lib/format';
import { usePlayer } from '../player/PlayerProvider';
import CoverArt from '../media/CoverArt';
import AddTrackDialog from './AddTrackDialog';
import TrackTable, { type TrackTableRow } from '../track/TrackTable';
import type { Playlist, Track, UserRole } from '@cafe-music/shared';

interface PlaylistTrackRow {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
  addedAt: string;
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
  const [dragOver, setDragOver] = useState(false);

  const { current, queue, playTrack } = usePlayer();

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
  const trackTableRows: TrackTableRow[] = rows.map((row) => ({
    id: row.trackId,
    track: row.track,
    addedAt: row.addedAt,
  }));

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

  // Kéo từ kho nhạc thả vào danh sách. `TrackTable` tự bắt kéo-thả nội bộ để
  // đổi thứ tự (dừng nổi bọt bằng `stopPropagation`) nên chỉ còn phải lo
  // trường hợp kéo từ ngoài vào ở đây.
  const handleLibraryDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const trackId = e.dataTransfer.getData('trackId');
    if (!trackId) return;

    void addTrack(trackId, trackId);
  };

  // Kéo thả trong danh sách để đổi thứ tự phát
  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (!playlist) return;

    const next = [...playlist.playlistTracks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);

    setPlaylist({ ...playlist, playlistTracks: next });

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
      <div className="flex flex-col gap-3" aria-label="Đang tải playlist">
        <div className="skeleton h-6 w-64" />
        <div className="skeleton h-40 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
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
              {rows.length} bài · {formatTotalDurationExact(totalDurationMs)}
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
          {trackTableRows.length === 0 ? (
            <p className="text-sm p-8 text-center" style={{ color: 'rgba(248,250,252,0.5)' }}>
              Chưa có bài nào — bấm &quot;Thêm bài hát&quot; hoặc kéo từ kho nhạc vào đây.
            </p>
          ) : (
            <TrackTable
              rows={trackTableRows}
              showAddedAt
              draggable
              onReorder={(fromIndex, toIndex) => void handleReorder(fromIndex, toIndex)}
              onPlay={(_row, index) => void playFrom(index)}
              onRemove={(row) => void removeTrack(row.track.id, row.track.title)}
            />
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
