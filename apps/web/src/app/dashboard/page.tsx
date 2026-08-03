'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import StoresOverview from '../../components/store/StoresOverview';

export default function DashboardPage() {
  const t = useTranslations('dashboard.home');
  const tNav = useTranslations('nav');

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          {tNav('overview')}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-foreground-50)' }}>
          {t('subtitle')}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
            {t('playingAtStores')}
          </h2>
          <Link
            href="/dashboard/stores"
            className="text-xs cursor-pointer underline transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none"
            style={{ color: 'var(--color-secondary)' }}
          >
            {t('manageStores')}
          </Link>
        </div>

        <StoresOverview />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          {t('startPlaying')}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-foreground-50)' }}>
          {t('startPlayingPrefix')}{' '}
          <Link
            href="/dashboard/playlists"
            className="underline cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none"
            style={{ color: 'var(--color-secondary)' }}
          >
            {tNav('playlists')}
          </Link>{' '}
          {t('startPlayingSuffix')}
        </p>
      </section>
    </div>
  );
}
