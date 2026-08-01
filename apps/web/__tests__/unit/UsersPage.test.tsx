import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersPage from '../../src/app/dashboard/users/page';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));

jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-me', email: 'me@cafe.com', role: 'ORG_ADMIN' },
    loading: false,
    login: jest.fn(),
    logout: jest.fn(),
  }),
}));

const mockApi = api as jest.Mocked<typeof api>;

const users = [
  {
    id: 'user-me',
    email: 'me@cafe.com',
    name: 'Chính tôi',
    role: 'ORG_ADMIN',
    storeId: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-unassigned',
    email: 'unassigned@cafe.com',
    name: 'Chưa gán quán',
    role: 'STORE_ADMIN',
    storeId: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-assigned',
    email: 'assigned@cafe.com',
    name: 'Đã gán quán',
    role: 'STORE_ADMIN',
    storeId: 'store-1',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-deactivated',
    email: 'deactivated@cafe.com',
    name: 'Đã vô hiệu hoá',
    role: 'STORE_ADMIN',
    storeId: 'store-1',
    isActive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const stores = [{ id: 'store-1', name: 'Quán Nguyễn Huệ' }];

describe('UsersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockImplementation((url: string) => {
      if (url === '/users') return Promise.resolve({ data: users });
      if (url === '/stores') return Promise.resolve({ data: stores });
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
  });

  it('shows an Edit button even for a store admin with no store assigned', async () => {
    render(<UsersPage />);

    const row = await screen.findByTestId('user-row-user-unassigned');
    expect(within(row).getByRole('button', { name: 'Sửa' })).toBeInTheDocument();
  });

  it('opens the edit dialog prefilled with the selected user when Edit is clicked', async () => {
    render(<UsersPage />);

    const row = await screen.findByTestId('user-row-user-assigned');
    await userEvent.click(within(row).getByRole('button', { name: 'Sửa' }));

    const dialog = await screen.findByRole('dialog', { name: /sửa người dùng/i });
    expect(within(dialog).getByDisplayValue('Đã gán quán')).toBeInTheDocument();
  });

  it('disables edit and deactivate actions on the signed-in admin own row', async () => {
    render(<UsersPage />);

    const row = await screen.findByTestId('user-row-user-me');
    expect(within(row).getByRole('button', { name: 'Sửa' })).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Vô hiệu hoá' })).toBeDisabled();
  });

  it('opens the deactivate confirmation dialog when Deactivate is clicked', async () => {
    render(<UsersPage />);

    const row = await screen.findByTestId('user-row-user-assigned');
    await userEvent.click(within(row).getByRole('button', { name: 'Vô hiệu hoá' }));

    expect(
      await screen.findByRole('dialog', { name: /vô hiệu hoá tài khoản/i }),
    ).toBeInTheDocument();
  });

  it('shows a Reactivate button for a deactivated user and calls the API directly without a confirm dialog', async () => {
    mockApi.patch.mockResolvedValue({ data: { ...users[3], isActive: true } });
    render(<UsersPage />);

    const row = await screen.findByTestId('user-row-user-deactivated');
    await userEvent.click(within(row).getByRole('button', { name: 'Kích hoạt lại' }));

    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith('/users/user-deactivated', {
        isActive: true,
      }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
