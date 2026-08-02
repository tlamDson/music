import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfileSection from '../../src/components/settings/ProfileSection';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), patch: jest.fn() },
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockApi = api as jest.Mocked<typeof api>;

const profile = {
  id: 'user-1',
  email: 'admin@cafe.com',
  name: 'Quản trị chuỗi',
  role: 'ORG_ADMIN',
  storeId: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const storeProfile = {
  ...profile,
  id: 'user-2',
  email: 'store1@cafe.com',
  name: 'Quản lý quán 1',
  role: 'STORE_ADMIN',
  storeId: 'store-1',
  store: { name: 'Quán Nguyễn Huệ' },
};

describe('ProfileSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue(profile);
  });

  it('renders email and role as read-only text, not inputs', async () => {
    render(<ProfileSection />);

    expect(await screen.findByText('admin@cafe.com')).toBeInTheDocument();
    expect(screen.getByText('Quản lý chuỗi')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Vai trò')).not.toBeInTheDocument();
  });

  it('shows the assigned store for a store admin', async () => {
    mockApi.get.mockResolvedValue(storeProfile);
    render(<ProfileSection />);

    expect(await screen.findByText('Quán Nguyễn Huệ')).toBeInTheDocument();
  });

  it('prefills the name field and saves changes', async () => {
    mockApi.patch.mockResolvedValue({ ...profile, name: 'Tên mới' });
    render(<ProfileSection />);

    const nameInput = await screen.findByLabelText('Họ tên');
    expect(nameInput).toHaveValue('Quản trị chuỗi');

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Tên mới');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalledWith('/me', { name: 'Tên mới' }));
  });
});
