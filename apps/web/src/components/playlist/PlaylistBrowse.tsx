'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { useSyncGroups } from '../../hooks/useSyncGroups';
import { usePlayer } from '../player/PlayerProvider';
import { readRecentPlaylists, rememberRecentPlaylist } from '../../lib/recent-playlists';
import { formatTotalDuration } from '../../lib/format';
import PlaylistCard, { type BrowsePlaylist } from './PlaylistCard';
import CoverArt from '../media/CoverArt';
import type { ApiResponse, UserRole } from '@cafe-music/shared';

type ScopeFilter = 'ALL' | 'ORG' | 'STORE';

interface PlaylistBrowseProps {
  role: UserRole;
  storeId: string | null;
  /** `/dashboard/playlists` hoặc `/store/playlists` — nơi mở trang chi tiết. */
  basePath: string;
}

const CHIPS: Array<{ value: ScopeFilter; label: string }> = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ORG', label: 'Chuỗi' },
  { value: 'STORE', label: 'Quán' },
];

export default function PlaylistBrowse({ role, storeId, basePath }: PlaylistBrowseProps) {
  const [playlists, setPlaylists] = useState<BrowsePlaylist[]>([]);
  const [scope, setScope] = useState<ScopeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const { defaultGroupId } = useSyncGroups();
  const { current, isPlaying, queue } = usePlayer();

  const isStore = role === 'STORE_ADMIN';

  const fetchPlaylists = useCallback(async () => {
    const params = new URLSearchParams({ sort: 'recent' });
    if (scope !== 'ALL') params.set('scope', scope);
    if (search.trim()) params.set('q', search.trim());

    try {
      const res = await api.get<ApiResponse<BrowsePlaylist[]>>(`/playlists?${params.toString()}`);
      setPlaylists(res.data);
    } catch {
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  }, [scope, search]);

  useEffect(() => {
    setRecentIds(readRecentPlaylists());
  }, []);

  useEffect(() => {
    // Gõ tới đâu gọi API tới đó thì quá ồn — chờ người dùng ngừng gõ
    const timer = setTimeout(() => void fetchPlaylists(), 250);
    return () => clearTimeout(timer);
  }, [fetchPlaylists]);

  const handlePlay = async (playlist: BrowsePlaylist) => {
    try {
      if (isStore) {
        if (!storeId) {
          toast.error('Tài khoản chưa gắn với quán nào');
          return;
        }
        // Quán phát playlist riêng: tự tách khỏi nhóm sync, hết hàng chờ tự quay lại
        await api.post(`/sync/stores/${storeId}/play`, {
          playlistId: playlist.id,
          trackIndex: 0,
          returnToGroupOnFinish: true,
        });
        toast.success(`Đang phát "${playlist.name}" tại quán`);
      } else {
        if (!defaultGroupId) {
          toast.error('Chưa có sync group nào — tạo nhóm ở trang Sync Control trước');
          return;
        }
        await api.post(`/sync/groups/${defaultGroupId}/play`, {
          playlistId: playlist.id,
          trackIndex: 0,
          mode: 'LOOSE',
        });
        toast.success(`Đang phát "${playlist.name}" trên hệ thống`);
      }

      setRecentIds(rememberRecentPlaylist(playlist.id));
    } catch {
      toast.error('Phát playlist thất bại — playlist có track nào chưa?');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    try {
      await api.post('/playlists', {
        name: newName.trim(),
        // Quán chỉ tạo được playlist của chính mình
        scope: isStore ? 'STORE' : 'ORG',
        ...(isStore && storeId ? { storeId } : {}),
      });
      toast.success(`Đã tạo playlist "${newName.trim()}"`);
      setNewName('');
      await fetchPlaylists();
    } catch {
      toast.error('Tạo playlist thất bại');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (playlist: BrowsePlaylist) => {
    try {
      await api.delete(`/playlists/${playlist.id}`);
      setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
      toast.success('Đã xóa playlist');
    } catch {
      toast.error('Xóa playlist thất bại');
    }
  };

  const canDelete = (playlist: BrowsePlaylist) => !isStore || playlist.scope === 'STORE';

  const recent = recentIds
    .map((id) => playlists.find((playlist) => playlist.id === id))
    .filter((playlist): playlist is BrowsePlaylist => Boolean(playlist));

  const rows: Array<{ title: string; items: BrowsePlaylist[] }> = [
    { title: 'Gần đây', items: recent },
    { title: 'Playlist của chuỗi', items: playlists.filter((p) => p.scope === 'ORG') },
    { title: 'Playlist của quán', items: playlists.filter((p) => p.scope === 'STORE') },
  ];

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        {/* Chip lọc + tìm kiếm */}
        <div className="flex flex-wrap items-center gap-3">
          {CHIPS.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setScope(chip.value)}
              className="px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
              style={{
                backgroundColor:
                  scope === chip.value ? 'var(--color-accent)' : 'var(--color-muted)',
                color: scope === chip.value ? 'white' : 'var(--color-foreground)',
                border: '1px solid var(--color-border)',
              }}
              aria-pressed={scope === chip.value}
            >
              {chip.label}
            </button>
          ))}

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Bạn muốn phát nội dung gì?"
            aria-label="Tìm playlist"
            className="flex-1 min-w-48 px-4 py-2 rounded-full text-sm outline-none transition-all duration-150"
            style={{
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>

        {/* Tạo playlist */}
        <form onSubmit={(e) => void handleCreate(e)} className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Tên playlist mới (VD: Ballad, V-Pop)..."
            aria-label="Tên playlist"
            className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          />
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? 'Đang tạo...' : 'Tạo playlist'}
          </button>
        </form>

        {loading ? (
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Đang tải...
          </p>
        ) : playlists.length === 0 ? (
          <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Không có playlist nào khớp.
          </p>
        ) : (
          rows
            .filter((row) => row.items.length > 0)
            .map((row) => (
              <section key={row.title} className="flex flex-col gap-3">
                <h2
                  className="text-lg font-semibold"
                  style={{
                    color: 'var(--color-foreground)',
                    fontFamily: 'Fira Code, monospace',
                  }}
                >
                  {row.title}
                </h2>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {row.items.map((playlist) => (
                    <PlaylistCard
                      key={`${row.title}-${playlist.id}`}
                      playlist={playlist}
                      href={`${basePath}/${playlist.id}`}
                      isPlaying={isPlaying && current?.id === playlist.id}
                      onPlay={() => void handlePlay(playlist)}
                      onDelete={canDelete(playlist) ? () => void handleDelete(playlist) : undefined}
                    />
                  ))}
                </div>
              </section>
            ))
        )}
      </div>

      {/* Panel phải: đang phát + hàng chờ */}
      <aside
        className="hidden xl:flex w-72 flex-shrink-0 flex-col gap-4 p-4 rounded-xl h-fit"
        style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
        aria-label="Đang phát"
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Đang phát
        </h2>

        {current ? (
          <>
            <CoverArt seed={current.id} label={current.title} size={240} className="w-full" />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                {current.title}
              </p>
              {current.artist && (
                <p className="text-xs mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
                  {current.artist}
                </p>
              )}
            </div>
            {queue && (
              <p className="text-xs" style={{ color: 'var(--color-accent)' }}>
                Còn {queue.remaining} bài · sau đó quay lại nhóm sync
              </p>
            )}
          </>
        ) : (
          <p className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Chưa phát bài nào. Bấm nút phát trên một playlist để bắt đầu.
          </p>
        )}

        <div className="pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
            {playlists.length} playlist ·{' '}
            {formatTotalDuration(
              playlists.reduce((sum, playlist) => sum + (playlist.totalDurationMs ?? 0), 0),
            )}
          </p>
        </div>
      </aside>
    </div>
  );
}
