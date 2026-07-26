import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import AppShell from '../../src/components/layout/AppShell';
import { dashboardNavItems, storeNavItems } from '../../src/lib/nav';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/playlists',
}));

const mockApi = api as jest.Mocked<typeof api>;

const playlists = [
  { id: 'playlist-1', name: 'Nhạc Lofi Chill Việt Nam', scope: 'ORG' },
  { id: 'playlist-2', name: 'Nhạc quán Nguyễn Huệ', scope: 'STORE' },
];

describe('AppShell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: playlists });
  });

  const renderShell = (role: 'ORG_ADMIN' | 'STORE_ADMIN') =>
    render(
      <AppShell
        navItems={role === 'STORE_ADMIN' ? storeNavItems() : dashboardNavItems(role)}
        user={{ email: 'admin@cafe.com', role }}
      >
        <p>nội dung trang</p>
      </AppShell>,
    );

  it('renders the chain-wide sections for an org admin', () => {
    renderShell('ORG_ADMIN');

    expect(screen.getByRole('link', { name: 'Quán' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Người dùng' })).toBeInTheDocument();
  });

  it('never offers chain-wide sections to a store console', () => {
    renderShell('STORE_ADMIN');

    expect(screen.queryByRole('link', { name: 'Quán' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Người dùng' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Playlists' })).toBeInTheDocument();
  });

  it('marks the section matching the current path', () => {
    renderShell('ORG_ADMIN');

    expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('aria-current', 'page');
  });

  it('lists the playlist library in the sidebar', async () => {
    renderShell('ORG_ADMIN');

    expect(await screen.findByText('Nhạc Lofi Chill Việt Nam')).toBeInTheDocument();
    expect(screen.getByText('Playlist của quán')).toBeInTheDocument();
  });

  it('renders the page content', async () => {
    renderShell('ORG_ADMIN');

    expect(screen.getByText('nội dung trang')).toBeInTheDocument();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/playlists'));
  });

  it('pins the sidebar to the viewport so it never scrolls away with the page', () => {
    renderShell('ORG_ADMIN');

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.className).toEqual(expect.stringContaining('sticky'));
    expect(nav.className).toEqual(expect.stringContaining('top-0'));
    expect(nav.className).toEqual(expect.stringContaining('h-screen'));
    expect(nav.className).toEqual(expect.stringContaining('overflow-y-auto'));
  });

  it('hides the sidebar off-canvas on small screens until the menu button opens it', () => {
    renderShell('ORG_ADMIN');

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.className).toEqual(expect.stringContaining('-translate-x-full'));

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));

    expect(nav.className).not.toEqual(expect.stringContaining('-translate-x-full'));
    expect(screen.getByRole('button', { name: 'Đóng menu điều hướng' })).toBeInTheDocument();
  });

  it('closes the mobile sidebar when the backdrop is clicked', () => {
    renderShell('ORG_ADMIN');

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));
    fireEvent.click(screen.getByTestId('mobile-nav-backdrop'));

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.className).toEqual(expect.stringContaining('-translate-x-full'));
  });

  it('keeps the mobile nav backdrop mounted briefly after closing so the exit transition can play', () => {
    jest.useFakeTimers();
    renderShell('ORG_ADMIN');

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));
    expect(screen.getByTestId('mobile-nav-backdrop')).toHaveAttribute('data-state', 'open');

    fireEvent.click(screen.getByTestId('mobile-nav-backdrop'));

    // Ngay sau khi đóng, backdrop vẫn còn trong DOM (đổi sang trạng thái closed)
    // để animation exit chạy hết, không biến mất đột ngột.
    expect(screen.getByTestId('mobile-nav-backdrop')).toHaveAttribute('data-state', 'closed');

    act(() => {
      jest.advanceTimersByTime(199);
    });
    expect(screen.getByTestId('mobile-nav-backdrop')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(screen.queryByTestId('mobile-nav-backdrop')).not.toBeInTheDocument();

    jest.useRealTimers();
  });
});
