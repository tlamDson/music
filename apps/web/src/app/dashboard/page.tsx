'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { useSyncGroups } from '../../hooks/useSyncGroups';
import type { ApiResponse, Playlist } from '@cafe-music/shared';

export default function DashboardPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const { defaultGroupId } = useSyncGroups();

  useEffect(() => {
    api
      .get<ApiResponse<Playlist[]>>('/playlists')
      .then((res) => setPlaylists(res.data))
      .catch(() => setPlaylists([]))
      .finally(() => setLoading(false));
  }, []);

  const handlePlay = async (playlistId: string) => {
    if (!defaultGroupId) {
      toast.error('Chưa có sync group nào — tạo nhóm ở trang Sync Control trước');
      return;
    }
    try {
      await api.post(`/sync/groups/${defaultGroupId}/play`, {
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
          Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Manage your cafe music playlists
        </p>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-foreground)' }}>
          Playlists
        </h2>

        {loading ? (
          <div className="flex items-center gap-2" style={{ color: 'rgba(248,250,252,0.5)' }}>
            <div
              className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--color-accent)' }}
            />
            Loading playlists...
          </div>
        ) : playlists.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
            No playlists yet. Create one in the Playlists tab.
          </p>
        ) : (
          <div className="grid gap-3">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                className="flex items-center justify-between p-4 rounded-xl"
                style={{
                  backgroundColor: 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div>
                  <p className="font-medium" style={{ color: 'var(--color-foreground)' }}>
                    {playlist.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(248,250,252,0.5)' }}>
                    {playlist.scope} · {playlist.trackCount ?? 0} tracks
                  </p>
                </div>
                <button
                  onClick={() => void handlePlay(playlist.id)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                  aria-label={`Play ${playlist.name}`}
                >
                  Play All
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
