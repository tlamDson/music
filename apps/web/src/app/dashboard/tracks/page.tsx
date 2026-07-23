'use client';

import { useAuth } from '../../../hooks/useAuth';
import TrackLibrary from '../../../components/track/TrackLibrary';
import type { UserRole } from '@cafe-music/shared';

export default function TracksPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Kho nhạc
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Nhạc dùng chung cho cả chuỗi
        </p>
      </div>

      <TrackLibrary role={user.role as UserRole} storeId={user.storeId} />
    </div>
  );
}
