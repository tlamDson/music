'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import TrackTable, { type TrackTableRow } from '../track/TrackTable';
import { formatTotalDurationExact } from '../../lib/format';
import type { Playlist, Track } from '@cafe-music/shared';

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

interface StorePlaylistTracksProps {
  playlistId: string;
  /** `trackIndex` là vị trí trong danh sách gốc của playlist (đúng thứ tự
   * `GET /playlists/:id` trả về) — khớp với `trackIndex` mà
   * `POST /sync/stores/:id/play` mong đợi. */
  onPlayTrack: (trackIndex: number, playlistName: string) => void;
  ariaLabel?: string;
}

/**
 * Bảng bài hát của MỘT playlist cụ thể — dùng chung cho khối "Đang phát" và
 * mục bung xem trước khi phát, ở cả `/store` (`StoreHome`) lẫn
 * `/dashboard/stores/[id]` (`StoreDetail`). Trước PR này, cả hai trang chỉ có
 * card playlist kèm một nút phát từ bài đầu — muốn xem playlist có bài gì
 * phải rời sang `/dashboard/playlists/[id]`. Tái dùng `TrackTable` (PR #59)
 * thay vì viết bảng track mới.
 */
export default function StorePlaylistTracks({
  playlistId,
  onPlayTrack,
  ariaLabel,
}: StorePlaylistTracksProps) {
  const [playlist, setPlaylist] = useState<PlaylistDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api
      .get<PlaylistDetailData>(`/playlists/${playlistId}`)
      .then((data) => {
        if (!cancelled) setPlaylist(data);
      })
      .catch(() => {
        if (!cancelled) setPlaylist(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-2" aria-label="Đang tải danh sách bài">
        <div className="skeleton h-10 w-full rounded-lg" />
        <div className="skeleton h-10 w-full rounded-lg" />
        <div className="skeleton h-10 w-full rounded-lg" />
      </div>
    );
  }

  if (!playlist || playlist.playlistTracks.length === 0) {
    return (
      <p className="text-sm p-4" style={{ color: 'var(--color-foreground-50)' }}>
        Playlist chưa có bài nào.
      </p>
    );
  }

  const rows: TrackTableRow[] = playlist.playlistTracks.map((row) => ({
    id: row.trackId,
    track: row.track,
  }));
  const totalDurationMs = rows.reduce((sum, row) => sum + (row.track.durationMs ?? 0), 0);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs px-1" style={{ color: 'var(--color-foreground-50)' }}>
        {rows.length} bài · {formatTotalDurationExact(totalDurationMs)}
      </p>
      <TrackTable
        rows={rows}
        onPlay={(_row, index) => onPlayTrack(index, playlist.name)}
        ariaLabel={ariaLabel ?? `Danh sách bài trong ${playlist.name}`}
      />
    </div>
  );
}
