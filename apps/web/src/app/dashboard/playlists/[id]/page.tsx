'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '../../../../lib/api-client';
import TrackPlayButton from '../../../../components/TrackPlayButton';
import type { ApiResponse, Playlist, Track } from '@cafe-music/shared';

interface PlaylistTrackRow {
  id: string;
  playlistId: string;
  trackId: string;
  position: number;
  track: Track;
}

interface PlaylistDetail extends Omit<Playlist, 'trackCount'> {
  playlistTracks: PlaylistTrackRow[];
}

export default function PlaylistEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [library, setLibrary] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [detail, tracks] = await Promise.all([
        api.get<PlaylistDetail>(`/playlists/${id}`),
        api.get<ApiResponse<Track[]>>('/tracks'),
      ]);
      setPlaylist(detail);
      setLibrary(tracks.data);
    } catch {
      toast.error('Không tải được playlist');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const inPlaylist = new Set(playlist?.playlistTracks.map((pt) => pt.trackId) ?? []);

  const addTrack = async (trackId: string, title: string) => {
    if (inPlaylist.has(trackId)) {
      toast.error(`"${title}" đã có trong playlist`);
      return;
    }
    try {
      await api.post(`/playlists/${id}/tracks`, { trackId });
      await fetchAll();
      toast.success(`Đã thêm "${title}" vào playlist`);
    } catch {
      toast.error(`Thêm "${title}" thất bại`);
    }
  };

  const removeTrack = async (trackId: string, title: string) => {
    try {
      await api.delete(`/playlists/${id}/tracks/${trackId}`);
      setPlaylist((prev) =>
        prev
          ? { ...prev, playlistTracks: prev.playlistTracks.filter((pt) => pt.trackId !== trackId) }
          : prev,
      );
      toast.success(`Đã xóa "${title}" khỏi playlist`);
    } catch {
      toast.error(`Xóa "${title}" thất bại`);
    }
  };

  // Drop từ kho track (library) vào playlist
  const handleLibraryDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const trackId = e.dataTransfer.getData('trackId');
    if (!trackId) return;
    const track = library.find((t) => t.id === trackId);
    void addTrack(trackId, track?.title ?? trackId);
  };

  // Kéo thả sắp xếp lại thứ tự trong playlist
  const handleReorderDrop = async (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex || !playlist) return;
    const rows = [...playlist.playlistTracks];
    const [moved] = rows.splice(dragIndex, 1);
    rows.splice(targetIndex, 0, moved);
    setPlaylist({ ...playlist, playlistTracks: rows });
    setDragIndex(null);
    try {
      await api.patch(`/playlists/${id}/tracks/reorder`, {
        trackIds: rows.map((r) => r.trackId),
      });
      toast.success('Đã cập nhật thứ tự phát');
    } catch {
      toast.error('Cập nhật thứ tự thất bại');
      void fetchAll();
    }
  };

  if (loading) {
    return (
      <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
        Loading...
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
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/playlists"
          className="p-2 rounded-lg cursor-pointer transition-all duration-150 hover:opacity-80"
          style={{ color: 'var(--color-foreground)', border: '1px solid var(--color-border)' }}
          aria-label="Back to playlists"
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
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
          >
            {playlist.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
            {playlist.scope} · {playlist.playlistTracks.length} tracks — kéo thả từ kho bên phải để
            thêm, kéo trong danh sách để đổi thứ tự
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Playlist tracks — drop zone */}
        <section>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
            Trong playlist ({playlist.playlistTracks.length})
          </h2>
          <div
            aria-label="Playlist tracks"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleLibraryDrop}
            className="flex flex-col gap-2 rounded-xl transition-all duration-200 min-h-40"
            style={{
              border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
              backgroundColor: dragOver ? 'rgba(34,197,94,0.05)' : 'transparent',
              padding: 'var(--space-sm)',
            }}
          >
            {playlist.playlistTracks.length === 0 ? (
              <p className="text-sm m-auto py-10" style={{ color: 'rgba(248,250,252,0.5)' }}>
                Kéo track từ kho vào đây
              </p>
            ) : (
              playlist.playlistTracks.map((pt, i) => (
                <div
                  key={pt.trackId}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.stopPropagation();
                    void handleReorderDrop(i);
                  }}
                  className="flex items-center justify-between p-3 rounded-lg cursor-grab active:cursor-grabbing transition-all duration-150"
                  style={{
                    backgroundColor: 'var(--color-muted)',
                    border: '1px solid var(--color-border)',
                    opacity: dragIndex === i ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{ color: 'rgba(248,250,252,0.3)' }}
                    >
                      <path strokeLinecap="round" d="M4 8h16M4 16h16" />
                    </svg>
                    <span
                      className="text-xs w-5 text-right"
                      style={{ color: 'rgba(248,250,252,0.4)' }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-foreground)' }}
                      >
                        {pt.track.title}
                      </p>
                      {pt.track.artist && (
                        <p className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
                          {pt.track.artist}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <TrackPlayButton trackId={pt.trackId} title={pt.track.title} />
                    <button
                      onClick={() => void removeTrack(pt.trackId, pt.track.title)}
                      className="p-2 rounded cursor-pointer transition-all duration-150 hover:opacity-80"
                      style={{ color: 'var(--color-destructive)' }}
                      aria-label={`Remove ${pt.track.title}`}
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
                </div>
              ))
            )}
          </div>
        </section>

        {/* Track library */}
        <section>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
            Kho track ({library.length})
          </h2>
          <div className="flex flex-col gap-2">
            {library.length === 0 ? (
              <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
                Chưa có track nào — upload ở trang Tracks trước.
              </p>
            ) : (
              library.map((track) => {
                const added = inPlaylist.has(track.id);
                return (
                  <div
                    key={track.id}
                    draggable={!added}
                    onDragStart={(e) => e.dataTransfer.setData('trackId', track.id)}
                    className="flex items-center justify-between p-3 rounded-lg transition-all duration-150"
                    style={{
                      backgroundColor: 'var(--color-muted)',
                      border: '1px solid var(--color-border)',
                      opacity: added ? 0.45 : 1,
                      cursor: added ? 'default' : 'grab',
                    }}
                  >
                    <div>
                      <p
                        className="text-sm font-medium"
                        style={{ color: 'var(--color-foreground)' }}
                      >
                        {track.title}
                      </p>
                      {track.artist && (
                        <p className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
                          {track.artist}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <TrackPlayButton trackId={track.id} title={track.title} />
                      {added ? (
                        <span
                          className="flex items-center gap-1 text-xs px-2"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Đã thêm
                        </span>
                      ) : (
                        <button
                          onClick={() => void addTrack(track.id, track.title)}
                          className="p-2 rounded cursor-pointer transition-all duration-150 hover:opacity-80"
                          style={{ color: 'var(--color-accent)' }}
                          aria-label={`Add ${track.title}`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
