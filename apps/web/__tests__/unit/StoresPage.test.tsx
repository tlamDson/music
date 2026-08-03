import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoresPage from '../../src/app/dashboard/stores/page';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

const stores = [
  { id: 'store-1', name: 'Quán Nguyễn Huệ', status: 'PLAYING' as const },
  { id: 'store-2', name: 'Quán Lê Lợi', status: 'STOPPED' as const },
];

describe('StoresPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockApi.get.mockResolvedValue({ data: stores });
  });

  it('renders the input as a filter, not a create form', async () => {
    render(<StoresPage />);

    await screen.findByText('Quán Nguyễn Huệ');
    expect(screen.getByLabelText('Tìm quán')).toHaveAttribute('type', 'search');
    expect(screen.getByRole('button', { name: 'Thêm quán' })).toBeInTheDocument();
  });

  it('filters the store list as the user types', async () => {
    render(<StoresPage />);
    await screen.findByText('Quán Nguyễn Huệ');

    await userEvent.type(screen.getByLabelText('Tìm quán'), 'Lợi');

    expect(screen.queryByText('Quán Nguyễn Huệ')).not.toBeInTheDocument();
    expect(screen.getByText('Quán Lê Lợi')).toBeInTheDocument();
  });

  it('shows a distinct message when the filter matches nothing', async () => {
    render(<StoresPage />);
    await screen.findByText('Quán Nguyễn Huệ');

    await userEvent.type(screen.getByLabelText('Tìm quán'), 'không tồn tại');

    expect(await screen.findByText('Không tìm thấy quán nào khớp.')).toBeInTheDocument();
  });

  it('opens the create store dialog and creates a store', async () => {
    mockApi.post.mockResolvedValue({ id: 'new-store' });
    render(<StoresPage />);
    await screen.findByText('Quán Nguyễn Huệ');

    await userEvent.click(screen.getByRole('button', { name: 'Thêm quán' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thêm quán' });
    await userEvent.type(within(dialog).getByLabelText('Tên quán'), 'Quán mới');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm quán' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/stores', { name: 'Quán mới' }));
  });

  it('remembers the chosen view mode across remounts', async () => {
    const { unmount } = render(<StoresPage />);
    await screen.findByText('Quán Nguyễn Huệ');

    await userEvent.click(screen.getByRole('button', { name: 'Xem dạng lưới' }));
    expect(window.localStorage.getItem('cafe-music:view:stores')).toBe('grid');
    unmount();

    render(<StoresPage />);
    await screen.findByText('Quán Nguyễn Huệ');
    expect(screen.getByRole('button', { name: 'Xem dạng lưới' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
