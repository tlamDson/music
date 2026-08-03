'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { usePlayer } from '../player/PlayerProvider';
import { readRecentPlaylists, rememberRecentPlaylist } from '../../lib/recent-playlists';
import { formatTotalDuration } from '../../lib/format';
import { useViewMode } from '../../hooks/useViewMode';
import PlaylistCard, { type BrowsePlaylist } from './PlaylistCard';
import CreatePlaylistDialog from './CreatePlaylistDialog';
import ViewToggle from '../ui/ViewToggle';
import CoverArt from '../media/CoverArt';
import type { ApiResponse, UserRole } from '@cafe-music/shared';

type ScopeFilter = 'ALL' | 'ORG' | 'STORE';

interface PlaylistBrowseProps {
  role: UserRole;
  storeId: string | null;
  /** `/dashboard/playlists` hoặc `/store/playlists` — nơi mở trang chi tiết. */
  basePath: string;
}

interface PlaylistListRowProps {
  playlist: BrowsePlaylist;
  href: string;
  isPlaying: boolean;
  onPlay: () => void;
  onDelete?: () => void;
}

/** Hàng gọn cho chế độ danh sách — cùng thông tin với `PlaylistCard`, khác cách trình bày. */
function PlaylistListRow({ playlist, href, isPlaying, onPlay, onDelete }: PlaylistListRowProps) {
  const t = useTranslations('playlist.card');
  const tCommon = useTranslations('common');
  const trackCount = playlist._count?.playlistTracks ?? 0;

  return (
    <div
      className="group flex items-center gap-3 p-3 rounded-xl transition-[filter] duration-[var(--duration-fast)] hover:brightness-125"
      style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
    >
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none"
      >
        <CoverArt seed={playlist.id} label={playlist.name} size={44} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
            {playlist.name}
          </p>
          <p className="truncate text-xs" style={{ color: 'var(--color-foreground-50)' }}>
            {tCommon('playlistMeta.trackCount', { count: trackCount })} ·{' '}
            {formatTotalDuration(playlist.totalDurationMs, tCommon)}
          </p>
        </div>
      </Link>

      <button
        onClick={onPlay}
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none"
        style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
        aria-label={t('play', { name: playlist.name })}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
            <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
          </svg>
        )}
      </button>

      {onDelete && (
        <button
          onClick={onDelete}
          className="flex-shrink-0 p-2 rounded opacity-0 transition-[opacity,filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
          style={{ color: 'var(--color-destructive)' }}
          aria-label={t('delete', { name: playlist.name })}
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
  );
}

export default function PlaylistBrowse({ role, storeId, basePath }: PlaylistBrowseProps) {
  const t = useTranslations('playlist.browse');
  const tCommon = useTranslations('common');
  const CHIPS: Array<{ value: ScopeFilter; label: string }> = [
    { value: 'ALL', label: t('chipAll') },
    { value: 'ORG', label: t('chipOrg') },
    { value: 'STORE', label: t('chipStore') },
  ];
  const [playlists, setPlaylists] = useState<BrowsePlaylist[]>([]);
  const [scope, setScope] = useState<ScopeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [view, setView] = useViewMode('playlists', 'grid');

  const { current, isPlaying, queue, playTrack } = usePlayer();

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

  /**
   * Quán bấm phát = phát thật ra loa quán. Admin chuỗi bấm phát = **nghe thử
   * tại chỗ**, chỉ tab đang bấm nghe được — muốn phát ra quán thì vào
   * `/dashboard/stores/[id]`, nơi chọn đúng quán để phát.
   */
  const handlePlay = async (playlist: BrowsePlaylist) => {
    try {
      if (isStore) {
        if (!storeId) {
          toast.error(t('storeNotAssigned'));
          return;
        }
        await api.post(`/sync/stores/${storeId}/play`, {
          playlistId: playlist.id,
          trackIndex: 0,
        });
        toast.success(t('playingAtStore', { name: playlist.name }));
      } else {
        await previewFirstTrack(playlist);
      }

      setRecentIds(rememberRecentPlaylist(playlist.id));
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : t('playFailed'));
    }
  };

  const previewFirstTrack = async (playlist: BrowsePlaylist) => {
    const detail = await api.get<{
      playlistTracks: Array<{
        track: { id: string; title: string; artist: string | null; durationMs: number };
      }>;
    }>(`/playlists/${playlist.id}`);

    const first = detail.playlistTracks[0]?.track;
    if (!first) {
      toast.error(t('emptyPlaylist', { name: playlist.name }));
      return;
    }

    const { url } = await api.get<{ url: string }>(`/tracks/${first.id}/stream-url`);
    playTrack(
      { id: first.id, title: first.title, artist: first.artist, url, durationMs: first.durationMs },
      { mode: 'preview' },
    );
    toast.success(t('previewing', { name: playlist.name }));
  };

  const handleCreate = async (name: string) => {
    try {
      await api.post('/playlists', {
        name,
        // Quán chỉ tạo được playlist của chính mình
        scope: isStore ? 'STORE' : 'ORG',
        ...(isStore && storeId ? { storeId } : {}),
      });
      toast.success(t('created', { name }));
      setShowCreateDialog(false);
      await fetchPlaylists();
    } catch {
      toast.error(t('createFailed'));
    }
  };

  const handleDelete = async (playlist: BrowsePlaylist) => {
    try {
      await api.delete(`/playlists/${playlist.id}`);
      setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
      toast.success(t('deleted'));
    } catch {
      toast.error(t('deleteFailed'));
    }
  };

  const canDelete = (playlist: BrowsePlaylist) => !isStore || playlist.scope === 'STORE';

  const recent = recentIds
    .map((id) => playlists.find((playlist) => playlist.id === id))
    .filter((playlist): playlist is BrowsePlaylist => Boolean(playlist));

  const rows: Array<{ title: string; items: BrowsePlaylist[] }> = [
    { title: t('sectionRecent'), items: recent },
    { title: t('sectionOrgPlaylists'), items: playlists.filter((p) => p.scope === 'ORG') },
    { title: t('sectionStorePlaylists'), items: playlists.filter((p) => p.scope === 'STORE') },
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
              className="px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none"
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
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchAriaLabel')}
            className="flex-1 min-w-48 px-4 py-2 rounded-full text-sm outline-none transition-shadow duration-[var(--duration-fast)]"
            style={{
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          />

          <ViewToggle value={view} onChange={setView} />

          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
            }}
          >
            {t('createButton')}
          </button>
        </div>

        {loading ? (
          <div
            className="flex gap-4 overflow-x-auto pb-2"
            role="status"
            aria-label={t('loadingLabel')}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton w-44 h-44 flex-shrink-0" />
            ))}
            <span className="sr-only">{t('loadingText')}</span>
          </div>
        ) : playlists.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-foreground-50)' }}>
            {t('noMatches')}
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
                {view === 'grid' ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {row.items.map((playlist, index) => (
                      <PlaylistCard
                        key={`${row.title}-${playlist.id}`}
                        playlist={playlist}
                        href={`${basePath}/${playlist.id}`}
                        isPlaying={isPlaying && current?.id === playlist.id}
                        onPlay={() => void handlePlay(playlist)}
                        onDelete={
                          canDelete(playlist) ? () => void handleDelete(playlist) : undefined
                        }
                        index={index}
                        className="w-full"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {row.items.map((playlist) => (
                      <PlaylistListRow
                        key={`${row.title}-${playlist.id}`}
                        playlist={playlist}
                        href={`${basePath}/${playlist.id}`}
                        isPlaying={Boolean(isPlaying && current?.id === playlist.id)}
                        onPlay={() => void handlePlay(playlist)}
                        onDelete={
                          canDelete(playlist) ? () => void handleDelete(playlist) : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            ))
        )}
      </div>

      {/* Panel phải: đang phát + hàng chờ */}
      <aside
        className="hidden xl:flex w-72 flex-shrink-0 flex-col gap-4 p-4 rounded-xl h-fit"
        style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
        aria-label={t('nowPlaying')}
      >
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)' }}>
          {t('nowPlaying')}
        </h2>

        {current ? (
          <>
            <CoverArt seed={current.id} label={current.title} size={240} className="w-full" />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
                {current.title}
              </p>
              {current.artist && (
                <p className="text-xs mt-1" style={{ color: 'var(--color-foreground-50)' }}>
                  {current.artist}
                </p>
              )}
            </div>
            {queue && (
              <p className="text-xs" style={{ color: 'var(--color-accent)' }}>
                {tCommon('queueRemaining', { count: queue.remaining })}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs" style={{ color: 'var(--color-foreground-50)' }}>
            {t('noQueueHint')}
          </p>
        )}

        <div className="pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs" style={{ color: 'var(--color-foreground-50)' }}>
            {t('summary', {
              count: playlists.length,
              duration: formatTotalDuration(
                playlists.reduce((sum, playlist) => sum + (playlist.totalDurationMs ?? 0), 0),
                tCommon,
              ),
            })}
          </p>
        </div>
      </aside>

      <CreatePlaylistDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
