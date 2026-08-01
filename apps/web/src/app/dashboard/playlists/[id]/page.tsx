'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '../../../../hooks/useAuth';
import PlaylistDetail from '../../../../components/playlist/PlaylistDetail';
import type { UserRole } from '@cafe-music/shared';

export default function PlaylistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <PlaylistDetail
      playlistId={id}
      role={user.role as UserRole}
      storeId={user.storeId}
      backHref="/dashboard/playlists"
    />
  );
}
