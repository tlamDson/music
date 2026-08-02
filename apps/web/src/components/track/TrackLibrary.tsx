'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { measureAudioDuration } from '../../lib/format';
import { usePlayer } from '../player/PlayerProvider';
import TrackTable, { type TrackTableRow } from './TrackTable';
import TrackMetaDialog from './TrackMetaDialog';
import type { ApiResponse, Track, UserRole } from '@cafe-music/shared';

interface TrackLibraryProps {
  role: UserRole;
  storeId: string | null;
}

export default function TrackLibrary({ role, storeId }: TrackLibraryProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { current, playTrack, toggle } = usePlayer();
  const isStore = role === 'STORE_ADMIN';

  const fetchTracks = () => {
    api
      .get<ApiResponse<Track[]>>('/tracks?limit=100')
      .then((res) => setTracks(res.data))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchTracks, []);

  const uploadFile = async (file: File, title: string, artist: string) => {
    setSaving(true);
    try {
      // Backend không parse audio — trình duyệt đo hộ trước khi gửi
      const durationMs = await measureAudioDuration(file);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);
      if (artist) formData.append('artist', artist);
      formData.append('durationMs', String(durationMs));

      await api.postMultipart('/tracks', formData);
      fetchTracks();
      toast.success(`Đã tải lên "${title}"`);
      setPendingFile(null);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? `Tải lên thất bại: ${err.message}`
          : 'Tải lên thất bại',
      );
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const handlePickFile = (file: File) => {
    setUploading(true);
    setPendingFile(file);
  };

  const handleUpdate = async (title: string, artist: string) => {
    if (!editingTrack) return;
    setSaving(true);
    try {
      await api.patch(`/tracks/${editingTrack.id}`, { title, artist: artist || null });
      setTracks((prev) =>
        prev.map((t) => (t.id === editingTrack.id ? { ...t, title, artist: artist || null } : t)),
      );
      toast.success('Đã lưu thay đổi');
      setEditingTrack(null);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? `Lưu thất bại: ${err.message}` : 'Lưu thất bại',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (track: Track) => {
    try {
      await api.delete(`/tracks/${track.id}`);
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      toast.success('Đã xóa bài hát');
    } catch {
      toast.error('Xóa thất bại');
    }
  };

  const handlePlay = async (track: Track) => {
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

  // Quán chỉ được sửa/xóa nhạc của chính quán; track chung là của cả chuỗi
  const canModify = (track: Track) => !isStore || track.storeId === storeId;

  const visible = tracks.filter((track) =>
    `${track.title} ${track.artist ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const trackTableRows: TrackTableRow[] = visible.map((track) => ({ id: track.id, track }));

  return (
    <div className="flex flex-col gap-6">
      {/* Tải lên + tìm kiếm */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 rounded-full text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none"
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
            if (file) handlePickFile(file);
          }}
          className="px-4 py-2 rounded-full text-xs transition-colors duration-[var(--duration-base)]"
          style={{
            border: `1px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
            backgroundColor: dragOver ? 'rgba(34,197,94,0.05)' : 'transparent',
            color: 'var(--color-foreground-50)',
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
            if (file) handlePickFile(file);
            e.target.value = '';
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
        <p className="text-xs" style={{ color: 'var(--color-foreground-50)' }}>
          Nhạc bạn tải lên chỉ quán bạn nghe được; nhạc của chuỗi thì mọi quán dùng chung.
        </p>
      )}

      {loading ? (
        <div className="flex flex-col gap-2" aria-label="Đang tải kho nhạc">
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-foreground-50)' }}>
          Chưa có bài hát nào.
        </p>
      ) : (
        <div className="rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
          <TrackTable
            rows={trackTableRows}
            onPlay={(row) => void handlePlay(row.track)}
            onEdit={(row) => setEditingTrack(row.track)}
            canEdit={(row) => canModify(row.track)}
            onRemove={(row) => void handleDelete(row.track)}
            canRemove={(row) => canModify(row.track)}
            extraColumns={[
              {
                key: 'scope',
                header: 'Phạm vi',
                headerClassName: 'w-32 px-4 py-2 text-xs font-normal',
                cellClassName: 'px-4 py-3',
                render: (row) => {
                  const rowStoreId = row.track.storeId;
                  return (
                    <span
                      className="text-xs px-2 py-1 rounded-full whitespace-nowrap"
                      style={{
                        backgroundColor: rowStoreId
                          ? 'var(--color-secondary-soft-bg)'
                          : 'var(--color-accent-soft-bg)',
                        color: rowStoreId ? 'var(--color-secondary)' : 'var(--color-accent)',
                      }}
                    >
                      {rowStoreId ? 'Của quán' : 'Của chuỗi'}
                    </span>
                  );
                },
              },
            ]}
          />
        </div>
      )}

      <TrackMetaDialog
        open={pendingFile !== null}
        mode="upload"
        defaultTitle={pendingFile ? pendingFile.name.replace(/\.[^.]+$/, '') : ''}
        defaultArtist=""
        saving={saving}
        onSubmit={({ title, artist }) => {
          if (pendingFile) void uploadFile(pendingFile, title, artist);
        }}
        onClose={() => {
          setPendingFile(null);
          setUploading(false);
        }}
      />

      <TrackMetaDialog
        open={editingTrack !== null}
        mode="edit"
        defaultTitle={editingTrack?.title ?? ''}
        defaultArtist={editingTrack?.artist ?? ''}
        saving={saving}
        onSubmit={({ title, artist }) => void handleUpdate(title, artist)}
        onClose={() => setEditingTrack(null)}
      />
    </div>
  );
}
