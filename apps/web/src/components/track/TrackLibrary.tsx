'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { formatDuration, measureAudioDuration } from '../../lib/format';
import { usePlayer } from '../player/PlayerProvider';
import CoverArt from '../media/CoverArt';
import type { ApiResponse, Track, UserRole } from '@cafe-music/shared';

interface LibraryTrack extends Track {
  storeId?: string | null;
}

interface TrackLibraryProps {
  role: UserRole;
  storeId: string | null;
}

export default function TrackLibrary({ role, storeId }: TrackLibraryProps) {
  const [tracks, setTracks] = useState<LibraryTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { current, isPlaying, playTrack, toggle } = usePlayer();
  const isStore = role === 'STORE_ADMIN';

  const fetchTracks = () => {
    api
      .get<ApiResponse<LibraryTrack[]>>('/tracks')
      .then((res) => setTracks(res.data))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchTracks, []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      // Backend không parse audio — trình duyệt đo hộ trước khi gửi
      const durationMs = await measureAudioDuration(file);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^.]+$/, ''));
      formData.append('durationMs', String(durationMs));

      await api.postMultipart('/tracks', formData);
      fetchTracks();
      toast.success(`Đã tải lên "${file.name}"`);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? `Tải lên thất bại: ${err.message}`
          : 'Tải lên thất bại',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (track: LibraryTrack) => {
    try {
      await api.delete(`/tracks/${track.id}`);
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      toast.success('Đã xóa bài hát');
    } catch {
      toast.error('Xóa thất bại');
    }
  };

  const handlePlay = async (track: LibraryTrack) => {
    if (current?.id === track.id) {
      toggle();
      return;
    }

    try {
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
    } catch {
      toast.error(`Không phát được "${track.title}"`);
    }
  };

  // Quán chỉ được xóa nhạc của chính quán; track chung là của cả chuỗi
  const canDelete = (track: LibraryTrack) => !isStore || track.storeId === storeId;

  const visible = tracks.filter((track) =>
    `${track.title} ${track.artist ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Tải lên + tìm kiếm */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 rounded-full text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'white',
            opacity: uploading ? 0.7 : 1,
          }}
        >
          {uploading ? 'Đang tải lên...' : 'Tải bài hát lên'}
        </button>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) void uploadFile(file);
          }}
          className="px-4 py-2 rounded-full text-xs transition-all duration-200"
          style={{
            border: `1px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
            backgroundColor: dragOver ? 'rgba(34,197,94,0.05)' : 'transparent',
            color: 'rgba(248,250,252,0.5)',
          }}
        >
          hoặc kéo file vào đây · MP3, M4A, WAV, FLAC, OGG · tối đa 50MB
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          aria-label="Chọn file nhạc"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file);
          }}
        />

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm bài hát..."
          aria-label="Tìm bài hát"
          className="flex-1 min-w-48 px-4 py-2 rounded-full text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-muted)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
        />
      </div>

      {isStore && (
        <p className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Nhạc bạn tải lên chỉ quán bạn nghe được; nhạc của chuỗi thì mọi quán dùng chung.
        </p>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Đang tải...
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Chưa có bài hát nào.
        </p>
      ) : (
        <div className="rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
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
                  className="w-32 px-4 py-2 text-xs font-normal"
                  style={{ color: 'rgba(248,250,252,0.5)' }}
                >
                  Phạm vi
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
              {visible.map((track, index) => {
                const isCurrent = current?.id === track.id && isPlaying;

                return (
                  <tr
                    key={track.id}
                    className="group transition-all duration-150 hover:brightness-125"
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: isCurrent ? 'rgba(34,197,94,0.08)' : 'transparent',
                    }}
                  >
                    <td
                      className="px-4 py-3 text-sm tabular-nums"
                      style={{ color: isCurrent ? 'var(--color-accent)' : 'rgba(248,250,252,0.5)' }}
                    >
                      {index + 1}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <CoverArt seed={track.id} label={track.title} size={40} />
                        <div className="min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            style={{
                              color: isCurrent ? 'var(--color-accent)' : 'var(--color-foreground)',
                            }}
                          >
                            {track.title}
                          </p>
                          {track.artist && (
                            <p
                              className="text-xs truncate"
                              style={{ color: 'rgba(248,250,252,0.5)' }}
                            >
                              {track.artist}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2 py-1 rounded-full whitespace-nowrap"
                        style={{
                          backgroundColor: track.storeId
                            ? 'rgba(67,56,202,0.25)'
                            : 'rgba(34,197,94,0.15)',
                          color: track.storeId ? 'var(--color-secondary)' : 'var(--color-accent)',
                        }}
                      >
                        {track.storeId ? 'Của quán' : 'Của chuỗi'}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-right tabular-nums"
                      style={{ color: 'rgba(248,250,252,0.5)' }}
                    >
                      {formatDuration(track.durationMs)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => void handlePlay(track)}
                          className="p-2 rounded cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
                          style={{ color: 'var(--color-accent)' }}
                          aria-label={isCurrent ? `Tạm dừng ${track.title}` : `Phát ${track.title}`}
                        >
                          {isCurrent ? (
                            <svg
                              viewBox="0 0 24 24"
                              className="w-4 h-4"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <rect x="6" y="5" width="4" height="14" rx="1" />
                              <rect x="14" y="5" width="4" height="14" rx="1" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              className="w-4 h-4"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
                            </svg>
                          )}
                        </button>

                        {canDelete(track) && (
                          <button
                            onClick={() => void handleDelete(track)}
                            className="p-2 rounded cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
                            style={{ color: 'var(--color-destructive)' }}
                            aria-label={`Xóa ${track.title}`}
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
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
