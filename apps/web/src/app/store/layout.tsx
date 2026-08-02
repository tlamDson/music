'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import AppShell from '../../components/layout/AppShell';
import StoreSyncProvider from '../../components/sync/StoreSyncProvider';
import { storeNavItems, settingsPathFor } from '../../lib/nav';
import type { UserRole } from '@cafe-music/shared';

/**
 * Console của quán: cùng khung với `/dashboard` nhưng nav không có Sync
 * Control, Quán hay Người dùng — quán chỉ lo nhạc của mình.
 */
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--color-background)' }}
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: 'var(--color-accent)' }}
          aria-label={tCommon('loading')}
        />
      </div>
    );
  }

  if (!user) return null;

  return (
    <AppShell
      navItems={storeNavItems(tNav)}
      user={{ email: user.email, role: user.role }}
      settingsHref={settingsPathFor(user.role as UserRole)}
      onLogout={() => {
        logout();
        router.push('/login');
      }}
    >
      {/* Socket sync phải sống ở layout: mọi trang con của /store đều bấm phát
          được, không chỉ trang chủ. */}
      <StoreSyncProvider storeId={user.storeId}>{children}</StoreSyncProvider>
    </AppShell>
  );
}
