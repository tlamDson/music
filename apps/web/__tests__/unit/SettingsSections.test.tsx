import { render, screen } from '@testing-library/react';
import SettingsSections from '../../src/components/settings/SettingsSections';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), patch: jest.fn() },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockApi = api as jest.Mocked<typeof api>;

describe('SettingsSections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue({
      id: 'user-1',
      email: 'admin@cafe.com',
      name: 'Quản trị chuỗi',
      role: 'ORG_ADMIN',
      storeId: null,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('renders the page heading and both sections', async () => {
    render(<SettingsSections />);

    expect(screen.getByRole('heading', { name: 'Cài đặt', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Thông tin tài khoản')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
  });
});
