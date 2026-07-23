'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api-client';
import { useClockOffset } from '../../../hooks/useClockOffset';
import { useSyncGroups } from '../../../hooks/useSyncGroups';
import type { ApiResponse, Playlist, SyncGroupState, SyncMode } from '@cafe-music/shared';

export default function SyncPage() {
  const { groups, loading } = useSyncGroups();
  const [modes, setModes] = useState<Record<string, SyncMode>>({});
  const [states, setStates] = useState<Record<string, SyncGroupState | null>>({});
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState('');
  const { offset, measureOffset } = useClockOffset();

  useEffect(() => {
    void measureOffset();

    api
      .get<ApiResponse<Playlist[]>>('/playlists')
      .then((res) => setPlaylists(res.data))
      .catch(() => setPlaylists([]));
  }, [measureOffset]);

  // State phát của từng nhóm nằm ở Redis, phải hỏi riêng từng nhóm
  useEffect(() => {
    if (groups.length === 0) return;

    setModes(Object.fromEntries(groups.map((g) => [g.id, g.mode])));

    void Promise.all(
      groups.map((group) =>
        api
          .get<SyncGroupState | null>(`/sync/groups/${group.id}/state`)
          .then((state) => [group.id, state] as const)
          .catch(() => [group.id, null] as const),
      ),
    ).then((entries) => setStates(Object.fromEntries(entries)));
  }, [groups]);

  const playlistIdFor = (groupId: string) => selectedPlaylist || states[groupId]?.playlistId || '';

  const handlePlay = async (groupId: string) => {
    const playlistId = playlistIdFor(groupId);
    if (!playlistId) {
      toast.error('Chọn playlist trước khi phát');
      return;
    }
    try {
      await api.post(`/sync/groups/${groupId}/play`, {
        playlistId,
        trackIndex: 0,
        mode: modes[groupId] ?? 'LOOSE',
      });
      toast.success('Đang phát cho nhóm');
    } catch {
      toast.error('Phát thất bại — playlist có track nào chưa?');
    }
  };

  const handlePause = async (groupId: string) => {
    try {
      await api.post(`/sync/groups/${groupId}/pause`);
      toast.success('Đã tạm dừng nhóm');
    } catch {
      toast.error('Tạm dừng thất bại');
    }
  };

  const handleModeToggle = async (groupId: string) => {
    const next: SyncMode = (modes[groupId] ?? 'LOOSE') === 'LOOSE' ? 'TIGHT' : 'LOOSE';
    const playlistId = playlistIdFor(groupId);

    setModes((prev) => ({ ...prev, [groupId]: next }));

    // Backend chưa có endpoint đổi mode riêng: mode chỉ đi kèm lệnh play, nên
    // chỉ gửi lại khi nhóm đang có playlist để phát.
    if (!playlistId) return;

    try {
      await api.post(`/sync/groups/${groupId}/play`, {
        playlistId,
        trackIndex: states[groupId]?.trackIndex ?? 0,
        mode: next,
      });
    } catch {
      toast.error('Đổi chế độ sync thất bại');
      setModes((prev) => ({ ...prev, [groupId]: next === 'LOOSE' ? 'TIGHT' : 'LOOSE' }));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Sync Control
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Control playback synchronization across all stores
        </p>
      </div>

      {/* Clock offset indicator */}
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
        style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
      >
        <span style={{ color: 'rgba(248,250,252,0.5)' }}>Clock offset:</span>
        <span
          className="font-mono font-medium"
          style={{
            color: Math.abs(offset) < 50 ? 'var(--color-accent)' : 'var(--color-destructive)',
          }}
        >
          {offset > 0 ? '+' : ''}
          {offset}ms
        </span>
        <button
          onClick={() => void measureOffset()}
          className="ml-2 text-xs cursor-pointer underline"
          style={{ color: 'var(--color-secondary)' }}
        >
          Re-measure
        </button>
      </div>

      {/* Playlist chọn để phát */}
      <div className="flex items-center gap-3">
        <label
          htmlFor="sync-playlist"
          className="text-sm"
          style={{ color: 'rgba(248,250,252,0.5)' }}
        >
          Playlist phát:
        </label>
        <select
          id="sync-playlist"
          value={selectedPlaylist}
          onChange={(e) => setSelectedPlaylist(e.target.value)}
          className="px-4 py-2 rounded-lg text-sm outline-none cursor-pointer"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
        >
          <option value="">— Giữ playlist hiện tại của nhóm —</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Loading groups...
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Chưa có sync group nào.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const mode = modes[group.id] ?? group.mode;
            const status = states[group.id]?.status ?? group.status;

            return (
              <div
                key={group.id}
                className="p-6 rounded-xl flex flex-col gap-4"
                style={{
                  backgroundColor: 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold" style={{ color: 'var(--color-foreground)' }}>
                      {group.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor:
                            status === 'PLAYING'
                              ? 'rgba(34,197,94,0.15)'
                              : status === 'PAUSED'
                                ? 'rgba(234,179,8,0.15)'
                                : 'rgba(100,116,139,0.2)',
                          color:
                            status === 'PLAYING'
                              ? 'var(--color-accent)'
                              : status === 'PAUSED'
                                ? '#EAB308'
                                : 'rgba(248,250,252,0.4)',
                        }}
                      >
                        {status}
                      </span>
                      <span className="text-xs" style={{ color: 'rgba(248,250,252,0.4)' }}>
                        {group._count?.stores ?? 0} quán
                      </span>
                    </div>
                  </div>

                  {/* Sync mode toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
                      Sync Mode:
                    </span>
                    <button
                      onClick={() => void handleModeToggle(group.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200"
                      style={{
                        backgroundColor:
                          mode === 'TIGHT' ? 'rgba(67,56,202,0.3)' : 'rgba(34,197,94,0.15)',
                        color: mode === 'TIGHT' ? 'var(--color-secondary)' : 'var(--color-accent)',
                        border: `1px solid ${
                          mode === 'TIGHT' ? 'var(--color-secondary)' : 'var(--color-accent)'
                        }`,
                      }}
                      aria-label={`Toggle sync mode (currently ${mode})`}
                    >
                      {mode === 'TIGHT' ? (
                        <>
                          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
                            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm0 2a3 3 0 100 6A3 3 0 008 5z" />
                          </svg>
                          TIGHT
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
                            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3z" />
                          </svg>
                          LOOSE
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => void handlePlay(group.id)}
                    className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-90"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                  >
                    Play
                  </button>
                  <button
                    onClick={() => void handlePause(group.id)}
                    className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-80"
                    style={{
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--color-foreground)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    Pause
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
