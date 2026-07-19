'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api-client';
import type { ApiResponse, Playlist } from '@cafe-music/shared';

interface PlaylistWithCount extends Playlist {
  _count?: { playlistTracks: number };
}

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const fetchPlaylists = () => {
    api
      .get<ApiResponse<PlaylistWithCount[]>>('/playlists')
      .then((res) => setPlaylists(res.data))
      .catch(() => setPlaylists([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/playlists', { name: newName, scope: 'ORG' });
      toast.success(`Đã tạo playlist "${newName}" thành công`);
      setNewName('');
      fetchPlaylists();
    } catch {
      toast.error('Tạo playlist thất bại');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/playlists/${id}`);
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      toast.success('Đã xóa playlist');
    } catch {
      toast.error('Xóa playlist thất bại');
    }
  };

  const handlePlay = async (playlistId: string) => {
    try {
      await api.post('/sync/groups/sync-group-main/play', {
        playlistId,
        trackIndex: 0,
        mode: 'LOOSE',
      });
      toast.success('Đang phát playlist trên hệ thống');
    } catch {
      toast.error('Phát playlist thất bại — playlist có track nào chưa?');
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Playlists
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Create and manage playlists for your organization
        </p>
      </div>

      {/* Create */}
      <form onSubmit={(e) => void handleCreate(e)} className="flex gap-3">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Playlist name (e.g. Ballad, V-Pop)..."
          className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
          aria-label="Playlist name"
        />
        <button
          type="submit"
          disabled={creating}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-90"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'white',
            opacity: creating ? 0.7 : 1,
          }}
        >
          {creating ? 'Creating...' : 'Create'}
        </button>
      </form>

      {/* List */}
      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Loading...
        </p>
      ) : playlists.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          No playlists. Create one above.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className="p-4 rounded-xl"
              style={{
                backgroundColor: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium" style={{ color: 'var(--color-foreground)' }}>
                    {playlist.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(248,250,252,0.5)' }}>
                    {playlist.scope} · {playlist._count?.playlistTracks ?? 0} tracks
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handlePlay(playlist.id)}
                    className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                  >
                    Play All
                  </button>
                  <a
                    href={`/dashboard/playlists/${playlist.id}`}
                    className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer transition-all hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-foreground)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    Edit
                  </a>
                  <button
                    onClick={() => void handleDelete(playlist.id)}
                    className="p-1.5 rounded cursor-pointer transition-all hover:opacity-80"
                    style={{ color: 'var(--color-destructive)' }}
                    aria-label={`Delete ${playlist.name}`}
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
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
