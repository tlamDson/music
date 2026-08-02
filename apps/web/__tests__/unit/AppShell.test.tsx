import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { useTranslations } from 'next-intl';
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
const tNav = useTranslations('nav');

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
        navItems={role === 'STORE_ADMIN' ? storeNavItems(tNav) : dashboardNavItems(role, tNav)}
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

  // QC: sidebar tự sinh thanh cuộn riêng, cuộn mất cả tiêu đề lẫn nút đăng
  // xuất. Sidebar phải đứng yên tuyệt đối — chỉ `<main>` cuộn, và trong sidebar
  // chỉ danh sách playlist (dài vô hạn) được cuộn.
  it('không cho sidebar tự cuộn — chỉ khối thư viện playlist được cuộn', () => {
    renderShell('ORG_ADMIN');

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.className).toEqual(expect.stringContaining('overflow-hidden'));
    expect(nav.className).not.toEqual(expect.stringContaining('overflow-y-auto'));

    // `min-h-0` là điều kiện để `overflow-y-auto` có tác dụng trong flex column.
    const library = nav.querySelector('.overflow-y-auto');
    expect(library).not.toBeNull();
    expect(library?.className).toEqual(expect.stringContaining('min-h-0'));
  });

  it('giao việc cuộn trang cho <main>, shell cao đúng một màn hình', () => {
    const { container } = renderShell('ORG_ADMIN');

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toEqual(expect.stringContaining('h-[100dvh]'));
    expect(shell.className).toEqual(expect.stringContaining('overflow-hidden'));

    const main = screen.getByRole('main');
    expect(main.className).toEqual(expect.stringContaining('overflow-y-auto'));
    // Chừa chỗ cho thanh phát cố định theo chiều cao thật của nó.
    expect(main.style.paddingBottom).toEqual(expect.stringContaining('--player-bar-h'));
  });

  // Drawer mobile chiếm cả màn hình — không có đường thoát bằng bàn phím thì
  // người dùng bị kẹt trong đó.
  it('đóng drawer mobile khi bấm Escape', () => {
    renderShell('ORG_ADMIN');

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.className).not.toEqual(expect.stringContaining('-translate-x-full'));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(nav.className).toEqual(expect.stringContaining('-translate-x-full'));
  });

  // Bug QC: thanh phát (z-50) đè lên drawer nav (z-40) nên mở menu trên mobile
  // là không thấy email/vai trò và không bấm được nút Đăng xuất.
  it('xếp drawer và backdrop lên trên thanh phát theo thang z-index', () => {
    renderShell('ORG_ADMIN');

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.className).toEqual(expect.stringContaining('z-[var(--z-nav-drawer)]'));
    expect(screen.getByTestId('mobile-nav-backdrop').className).toEqual(
      expect.stringContaining('z-[var(--z-nav-backdrop)]'),
    );
    // Nút hamburger phải trên drawer để còn bấm đóng được.
    expect(screen.getByRole('button', { name: 'Đóng menu điều hướng' }).className).toEqual(
      expect.stringContaining('z-[var(--z-nav-toggle)]'),
    );
  });

  it('hides the sidebar off-canvas on small screens until the menu button opens it', () => {
    renderShell('ORG_ADMIN');

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.className).toEqual(expect.stringContaining('-translate-x-full'));

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));

    expect(nav.className).not.toEqual(expect.stringContaining('-translate-x-full'));
    expect(screen.getByRole('button', { name: 'Đóng menu điều hướng' })).toBeInTheDocument();
  });

  it('shows a settings link in the account block when settingsHref is provided', () => {
    render(
      <AppShell
        navItems={dashboardNavItems('ORG_ADMIN', tNav)}
        user={{ email: 'admin@cafe.com', role: 'ORG_ADMIN' }}
        settingsHref="/dashboard/settings"
      >
        <p>nội dung trang</p>
      </AppShell>,
    );

    expect(screen.getByRole('link', { name: 'Cài đặt' })).toHaveAttribute(
      'href',
      '/dashboard/settings',
    );
  });

  it('does not render a settings link when settingsHref is not provided', () => {
    renderShell('ORG_ADMIN');

    expect(screen.queryByRole('link', { name: 'Cài đặt' })).not.toBeInTheDocument();
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
