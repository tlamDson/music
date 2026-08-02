'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import AppShell from '../../components/layout/AppShell';
import StoresSyncBridge from '../../components/sync/StoresSyncBridge';
import { dashboardNavItems, settingsPathFor } from '../../lib/nav';
import type { UserRole } from '@cafe-music/shared';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push('/login');
      return;
    }

    // Store admin có console riêng — vào thẳng /dashboard thì đẩy về đó thay vì
    // để họ nhìn thấy phần quản trị của cả chuỗi.
    if (user.role === 'STORE_ADMIN') router.push('/store');
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

  if (!user || user.role === 'STORE_ADMIN') return null;

  return (
    <AppShell
      navItems={dashboardNavItems(user.role as UserRole, tNav)}
      user={{ email: user.email, role: user.role }}
      settingsHref={settingsPathFor(user.role as UserRole)}
      onLogout={() => {
        logout();
        router.push('/login');
      }}
    >
      <StoresSyncBridge />
      {children}
    </AppShell>
  );
}
