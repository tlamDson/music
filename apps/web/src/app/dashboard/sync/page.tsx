'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import { useClockOffset } from '../../../hooks/useClockOffset';
import type { SyncGroupState } from '@cafe-music/shared';

interface SyncGroup {
  id: string;
  name: string;
  mode: 'TIGHT' | 'LOOSE';
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
}

export default function SyncPage() {
  const [groups, setGroups] = useState<SyncGroup[]>([]);
  const [states, setStates] = useState<Record<string, SyncGroupState | null>>({});
  const [loading, setLoading] = useState(true);
  const { offset, measureOffset } = useClockOffset();

  useEffect(() => {
    void measureOffset();

    api
      .get<{ data: SyncGroup[] }>('/stores')
      .then(() => {
        const seedGroup: SyncGroup = { id: 'sync-group-main', name: 'Main Sync Group', mode: 'LOOSE', status: 'STOPPED' };
        setGroups([seedGroup]);
        return api.get<SyncGroupState | null>(`/sync/groups/${seedGroup.id}/state`);
      })
      .then((state) => {
        setStates({ 'sync-group-main': state });
      })
      .catch(() => {
        setGroups([{ id: 'sync-group-main', name: 'Main Sync Group', mode: 'LOOSE', status: 'STOPPED' }]);
      })
      .finally(() => setLoading(false));
  }, [measureOffset]);

  const handlePlay = async (groupId: string, mode: 'LOOSE' | 'TIGHT') => {
    await api.post(`/sync/groups/${groupId}/play`, {
      playlistId: 'playlist-placeholder',
      trackIndex: 0,
      mode,
    });
  };

  const handlePause = async (groupId: string) => {
    await api.post(`/sync/groups/${groupId}/pause`);
  };

  const handleModeToggle = async (groupId: string, current: 'LOOSE' | 'TIGHT') => {
    const next = current === 'LOOSE' ? 'TIGHT' : 'LOOSE';
    await api.post(`/sync/groups/${groupId}/play`, {
      playlistId: states[groupId]?.playlistId ?? '',
      trackIndex: states[groupId]?.trackIndex ?? 0,
      mode: next,
    });
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, mode: next } : g)));
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
          style={{ color: Math.abs(offset) < 50 ? 'var(--color-accent)' : 'var(--color-destructive)' }}
        >
          {offset > 0 ? '+' : ''}{offset}ms
        </span>
        <button
          onClick={() => void measureOffset()}
          className="ml-2 text-xs cursor-pointer underline"
          style={{ color: 'var(--color-secondary)' }}
        >
          Re-measure
        </button>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>Loading groups...</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className="p-6 rounded-xl flex flex-col gap-4"
              style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
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
                          group.status === 'PLAYING'
                            ? 'rgba(34,197,94,0.15)'
                            : group.status === 'PAUSED'
                            ? 'rgba(234,179,8,0.15)'
                            : 'rgba(100,116,139,0.2)',
                        color:
                          group.status === 'PLAYING'
                            ? 'var(--color-accent)'
                            : group.status === 'PAUSED'
                            ? '#EAB308'
                            : 'rgba(248,250,252,0.4)',
                      }}
                    >
                      {group.status}
                    </span>
                  </div>
                </div>

                {/* Sync mode toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>Sync Mode:</span>
                  <button
                    onClick={() => void handleModeToggle(group.id, group.mode)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200"
                    style={{
                      backgroundColor: group.mode === 'TIGHT' ? 'rgba(67,56,202,0.3)' : 'rgba(34,197,94,0.15)',
                      color: group.mode === 'TIGHT' ? 'var(--color-secondary)' : 'var(--color-accent)',
                      border: `1px solid ${group.mode === 'TIGHT' ? 'var(--color-secondary)' : 'var(--color-accent)'}`,
                    }}
                    aria-label={`Toggle sync mode (currently ${group.mode})`}
                  >
                    {group.mode === 'TIGHT' ? (
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
                  onClick={() => void handlePlay(group.id, group.mode)}
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
                >
                  Play
                </button>
                <button
                  onClick={() => void handlePause(group.id)}
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-80"
                  style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-foreground)', border: '1px solid var(--color-border)' }}
                >
                  Pause
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
