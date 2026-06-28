'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
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
          aria-label="Loading"
        />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      className="min-h-screen flex"
      style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
    >
      {/* Sidebar */}
      <nav
        className="w-64 flex flex-col p-4 gap-1"
        style={{ backgroundColor: 'var(--color-primary)', borderRight: '1px solid var(--color-border)' }}
      >
        <h2
          className="text-lg font-bold px-3 py-2 mb-2"
          style={{ fontFamily: 'Fira Code, monospace' }}
        >
          Cafe Music
        </h2>

        {[
          { href: '/dashboard', label: 'Overview' },
          { href: '/dashboard/playlists', label: 'Playlists' },
          { href: '/dashboard/tracks', label: 'Tracks' },
          { href: '/dashboard/sync', label: 'Sync Control' },
          ...(user.role === 'ORG_ADMIN'
            ? [
                { href: '/dashboard/stores', label: 'Stores' },
                { href: '/dashboard/users', label: 'Users' },
              ]
            : [{ href: '/dashboard/my-store', label: 'My Store' }]),
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-80"
            style={{ color: 'var(--color-foreground)' }}
          >
            {item.label}
          </a>
        ))}

        <div className="flex-1" />

        <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs" style={{ color: 'rgba(248,250,252,0.5)' }}>
            {user.email}
          </p>
          <p
            className="text-xs mt-0.5 font-medium"
            style={{ color: 'var(--color-accent)' }}
          >
            {user.role}
          </p>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
