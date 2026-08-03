'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '../../../hooks/useAuth';
import PlaylistBrowse from '../../../components/playlist/PlaylistBrowse';
import type { UserRole } from '@cafe-music/shared';

export default function StorePlaylistsPage() {
  const t = useTranslations('store.playlistsPage');
  const tNav = useTranslations('nav');
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          {tNav('playlists')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-foreground-50)' }}>
          {t('subtitle')}
        </p>
      </div>

      <PlaylistBrowse
        role={user.role as UserRole}
        storeId={user.storeId}
        basePath="/store/playlists"
      />
    </div>
  );
}
