'use client';

import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import { formatDuration } from '../../lib/format';
import CoverArt from '../media/CoverArt';
import type { ApiResponse, Track } from '@cafe-music/shared';

interface AddTrackDialogProps {
  existingTrackIds: string[];
  onAdd: (trackId: string, title: string) => void;
  onClose: () => void;
}

/**
 * Kho nhạc trước đây chiếm nửa màn hình bên cạnh playlist. Đưa vào hộp thoại để
 * bảng bài hát được trọn chiều ngang, vẫn kéo thả được từ đây sang danh sách.
 */
export default function AddTrackDialog({ existingTrackIds, onAdd, onClose }: AddTrackDialogProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<ApiResponse<Track[]>>('/tracks')
      .then((res) => setTracks(res.data))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const visible = tracks.filter((track) =>
    track.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Thêm bài hát vào playlist"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[80vh] flex flex-col gap-4 p-6 rounded-2xl"
        style={{
          backgroundColor: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
            Thêm bài hát
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded cursor-pointer transition-all duration-150 hover:brightness-125 focus-visible:outline-none"
            style={{ color: 'var(--color-foreground)' }}
            aria-label="Đóng"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm trong kho nhạc..."
          aria-label="Tìm bài hát"
          className="px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-muted)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
        />

        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {loading ? (
            <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
              Đang tải kho nhạc...
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
              Không có bài nào khớp.
            </p>
          ) : (
            visible.map((track) => {
              const added = existingTrackIds.includes(track.id);

              return (
                <div
                  key={track.id}
                  draggable={!added}
                  onDragStart={(e) => e.dataTransfer.setData('trackId', track.id)}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg transition-all duration-150"
                  style={{
                    backgroundColor: 'var(--color-muted)',
                    border: '1px solid var(--color-border)',
                    opacity: added ? 0.45 : 1,
                    cursor: added ? 'default' : 'grab',
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CoverArt seed={track.id} label={track.title} size={36} />
                    <div className="min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: 'var(--color-foreground)' }}
                      >
                        {track.title}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'rgba(248,250,252,0.5)' }}>
                        {[track.artist, formatDuration(track.durationMs)]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </div>

                  {added ? (
                    <span className="text-xs px-2" style={{ color: 'var(--color-accent)' }}>
                      Đã thêm
                    </span>
                  ) : (
                    <button
                      onClick={() => onAdd(track.id, track.title)}
                      className="p-2 rounded cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
                      style={{ color: 'var(--color-accent)' }}
                      aria-label={`Thêm ${track.title}`}
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
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
