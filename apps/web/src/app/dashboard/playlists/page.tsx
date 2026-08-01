'use client';

import { useAuth } from '../../../hooks/useAuth';
import PlaylistBrowse from '../../../components/playlist/PlaylistBrowse';
import type { UserRole } from '@cafe-music/shared';

export default function PlaylistsPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Playlists
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Nghe thử tại chỗ. Muốn phát ra loa quán thì vào trang Quán.
        </p>
      </div>

      <PlaylistBrowse
        role={user.role as UserRole}
        storeId={user.storeId}
        basePath="/dashboard/playlists"
      />
    </div>
  );
}
