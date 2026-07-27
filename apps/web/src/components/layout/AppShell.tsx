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

// Khớp --duration-base (200ms) trong globals.css — .mobile-nav-backdrop dùng
// cùng token cho transition opacity, nên timer unmount ở đây phải chờ đúng
// bằng thời lượng đó để animation exit chạy hết trước khi gỡ khỏi DOM.
const BACKDROP_EXIT_MS = 200;

/**
 * Khung dùng chung cho console chuỗi (`/dashboard`) và console quán (`/store`):
 * cùng sidebar thư viện, khác danh sách nav. Thanh phát nằm ở layout gốc nên
 * shell chỉ chừa khoảng trống dưới cùng cho nó.
 */
export default function AppShell({ navItems, user, onLogout, children }: AppShellProps) {
  const pathname = usePathname();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [backdropRendered, setBackdropRendered] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Cùng pattern với components/ui/Dialog.tsx: giữ backdrop trong DOM thêm
  // một nhịp sau khi đóng để animation exit (.mobile-nav-backdrop[data-state])
  // chạy hết, thay vì unmount ngay theo mobileNavOpen làm nó biến mất đột ngột.
  useEffect(() => {
    if (mobileNavOpen) {
      setBackdropRendered(true);
      return;
    }
    const timer = setTimeout(() => setBackdropRendered(false), BACKDROP_EXIT_MS);
    return () => clearTimeout(timer);
  }, [mobileNavOpen]);

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
      <button
        type="button"
        onClick={() => setMobileNavOpen((v) => !v)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-80"
        style={{ backgroundColor: 'var(--color-primary)', border: '1px solid var(--color-border)' }}
        aria-label={mobileNavOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
        aria-expanded={mobileNavOpen}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          {/* Hai path chồng lên nhau, mờ/xoay chéo nhau (xem .menu-icon-path
              trong globals.css) thay vì đổi thẳng `d` — hamburger và dấu X
              không cùng số điểm nên đổi `d` trực tiếp sẽ snap cứng. */}
          <path
            d="M2 5h16M2 10h16M2 15h16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="menu-icon-path"
            style={{
              opacity: mobileNavOpen ? 0 : 1,
              transform: mobileNavOpen ? 'rotate(-45deg)' : 'rotate(0deg)',
            }}
          />
          <path
            d="M4 4l12 12M16 4L4 16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="menu-icon-path"
            style={{
              opacity: mobileNavOpen ? 1 : 0,
              transform: mobileNavOpen ? 'rotate(0deg)' : 'rotate(45deg)',
            }}
          />
        </svg>
      </button>

      {backdropRendered && (
        <div
          data-testid="mobile-nav-backdrop"
          data-state={mobileNavOpen ? 'open' : 'closed'}
          onClick={() => setMobileNavOpen(false)}
          className="mobile-nav-backdrop md:hidden fixed inset-0 z-30 bg-black/50"
        />
      )}

      <nav
        className={`w-64 flex-shrink-0 flex flex-col gap-1 overflow-y-auto px-4 pt-4 pb-28 fixed inset-y-0 left-0 z-40 transition-transform duration-[var(--duration-base)] md:sticky md:top-0 md:h-screen md:z-auto ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
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
            className="px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-80 focus-visible:outline-none"
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
              {playlists.map((playlist, index) => (
                <li key={playlist.id}>
                  <Link
                    href={`${navItems[1]?.href ?? '/dashboard/playlists'}/${playlist.id}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-80 focus-visible:outline-none ${
                      index < 8 ? 'animate-stagger-item' : ''
                    }`}
                    style={index < 8 ? ({ '--i': index } as React.CSSProperties) : undefined}
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
              className="mt-2 text-xs underline cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-80 focus-visible:outline-none"
              style={{ color: 'var(--color-secondary)' }}
            >
              Đăng xuất
            </button>
          )}
        </div>
      </nav>

      <main key={pathname} className="flex-1 p-8 overflow-auto animate-fade-in">
        {children}
      </main>
    </div>
  );
}
