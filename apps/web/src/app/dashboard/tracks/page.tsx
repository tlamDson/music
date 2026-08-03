'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '../../../hooks/useAuth';
import TrackLibrary from '../../../components/track/TrackLibrary';
import type { UserRole } from '@cafe-music/shared';

export default function TracksPage() {
  const t = useTranslations('dashboard.tracksPage');
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
          {tNav('tracks')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-foreground-50)' }}>
          {t('subtitle')}
        </p>
      </div>

      <TrackLibrary role={user.role as UserRole} storeId={user.storeId} />
    </div>
  );
}
