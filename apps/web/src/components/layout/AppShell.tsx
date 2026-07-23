'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import type { NavItem } from '../../lib/nav';
import CoverArt from '../media/CoverArt';
import type { ApiResponse, Playlist } from '@cafe-music/shared';

interface AppShellProps {
  navItems: NavItem[];
  user: { email: string; role: string };
  onLogout?: () => void;
  children: React.ReactNode;
}

/**
 * Khung dùng chung cho console chuỗi (`/dashboard`) và console quán (`/store`):
 * cùng sidebar thư viện, khác danh sách nav. Thanh phát nằm ở layout gốc nên
 * shell chỉ chừa khoảng trống dưới cùng cho nó.
 */
export default function AppShell({ navItems, user, onLogout, children }: AppShellProps) {
  const pathname = usePathname();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    api
      .get<ApiResponse<Playlist[]>>('/playlists')
      .then((res) => setPlaylists(res.data))
      .catch(() => setPlaylists([]));
  }, []);

  const isActive = (href: string) =>
    href === pathname || (href !== '/dashboard' && href !== '/store' && pathname.startsWith(href));

  return (
    <div
      className="min-h-screen flex pb-28"
      style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
    >
      <nav
        className="w-64 flex-shrink-0 flex flex-col gap-1 p-4"
        style={{
          backgroundColor: 'var(--color-primary)',
          borderRight: '1px solid var(--color-border)',
        }}
        aria-label="Điều hướng chính"
      >
        <h2
          className="text-lg font-bold px-3 py-2 mb-2"
          style={{ fontFamily: 'Fira Code, monospace' }}
        >
          Cafe Music
        </h2>

        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? 'page' : undefined}
            className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-80 focus-visible:outline-none"
            style={{
              color: isActive(item.href) ? 'var(--color-accent)' : 'var(--color-foreground)',
              backgroundColor: isActive(item.href) ? 'rgba(34,197,94,0.1)' : 'transparent',
            }}
          >
            {item.label}
          </Link>
        ))}

        {/* Thư viện playlist */}
        <div className="mt-6 flex-1 overflow-y-auto">
          <p
            className="px-3 pb-2 text-xs uppercase tracking-wide"
            style={{ color: 'rgba(248,250,252,0.4)' }}
          >
            Thư viện
          </p>

          {playlists.length === 0 ? (
            <p className="px-3 text-xs" style={{ color: 'rgba(248,250,252,0.4)' }}>
              Chưa có playlist nào
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {playlists.map((playlist) => (
                <li key={playlist.id}>
                  <Link
                    href={`${navItems[1]?.href ?? '/dashboard/playlists'}/${playlist.id}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 hover:opacity-80 focus-visible:outline-none"
                  >
                    <CoverArt seed={playlist.id} label={playlist.name} size={32} />
                    <span className="min-w-0">
                      <span
                        className="block text-sm truncate"
                        style={{ color: 'var(--color-foreground)' }}
                      >
                        {playlist.name}
                      </span>
                      <span
                        className="block text-xs truncate"
                        style={{ color: 'rgba(248,250,252,0.5)' }}
                      >
                        {playlist.scope === 'ORG' ? 'Playlist của chuỗi' : 'Playlist của quán'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs truncate" style={{ color: 'rgba(248,250,252,0.5)' }}>
            {user.email}
          </p>
          <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-accent)' }}>
            {user.role}
          </p>
          {onLogout && (
            <button
              onClick={onLogout}
              className="mt-2 text-xs underline cursor-pointer transition-all duration-150 hover:opacity-80 focus-visible:outline-none"
              style={{ color: 'var(--color-secondary)' }}
            >
              Đăng xuất
            </button>
          )}
        </div>
      </nav>

      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  );
}
