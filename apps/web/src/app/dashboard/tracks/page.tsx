'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api-client';
import TrackPlayButton from '../../../components/TrackPlayButton';
import type { ApiResponse, Track } from '@cafe-music/shared';

export default function TracksPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTracks = () => {
    api
      .get<ApiResponse<Track[]>>('/tracks')
      .then((res) => setTracks(res.data))
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^.]+$/, ''));
      await api.postMultipart('/tracks', formData);
      fetchTracks();
      toast.success(`Đã upload "${file.name}" thành công`);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? `Upload thất bại: ${err.message}` : 'Upload thất bại',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/tracks/${id}`);
      setTracks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Đã xóa track');
    } catch {
      toast.error('Xóa track thất bại');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Tracks
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Upload and manage your music files
        </p>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="w-full rounded-xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200"
        style={{
          border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
          backgroundColor: dragOver ? 'rgba(34,197,94,0.05)' : 'var(--color-muted)',
          padding: 'var(--space-2xl)',
        }}
        role="button"
        aria-label="Upload track"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') fileInputRef.current?.click();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-12 h-12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ color: dragOver ? 'var(--color-accent)' : 'rgba(248,250,252,0.3)' }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <div className="text-center">
          <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
            {uploading ? 'Uploading...' : 'Drop audio file here'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
            MP3, M4A, WAV, FLAC, OGG supported · Max 50MB
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFileSelect}
          aria-label="Select audio file"
        />
      </div>

      {/* Tracks List */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
          Library ({tracks.length})
        </h2>

        {loading ? (
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Loading...
          </p>
        ) : tracks.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
            No tracks yet. Upload your first audio file above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tracks.map((track, i) => (
              <div
                key={track.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{
                  backgroundColor: 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs w-6 text-right"
                    style={{ color: 'rgba(248,250,252,0.4)' }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                      {track.title}
                    </p>
                    {track.artist && (
                      <p className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
                        {track.artist}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <TrackPlayButton trackId={track.id} title={track.title} />
                  <button
                    onClick={() => void handleDelete(track.id)}
                    className="p-2 rounded cursor-pointer transition-all duration-150 hover:opacity-80"
                    style={{ color: 'var(--color-destructive)' }}
                    aria-label={`Delete ${track.title}`}
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
