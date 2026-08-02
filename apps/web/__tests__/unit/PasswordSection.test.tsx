import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordSection from '../../src/components/settings/PasswordSection';
import { api, ApiError } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    api: { patch: jest.fn() },
    ApiError: MockApiError,
  };
});

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockApi = api as jest.Mocked<typeof api>;

async function fillForm(current: string, next: string, confirm: string) {
  await userEvent.type(screen.getByLabelText('Mật khẩu hiện tại'), current);
  await userEvent.type(screen.getByLabelText('Mật khẩu mới'), next);
  await userEvent.type(screen.getByLabelText('Nhập lại mật khẩu mới'), confirm);
}

describe('PasswordSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not call the API when the confirmation does not match', async () => {
    render(<PasswordSection />);

    await fillForm('mat-khau-cu', 'mat-khau-moi-1', 'mat-khau-khac');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu mới nhập lại không khớp');
    expect(mockApi.patch).not.toHaveBeenCalled();
  });

  it('submits and clears the fields on success', async () => {
    mockApi.patch.mockResolvedValue({ message: 'Password updated' });
    render(<PasswordSection />);

    await fillForm('mat-khau-cu', 'mat-khau-moi-1', 'mat-khau-moi-1');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith('/me/password', {
        currentPassword: 'mat-khau-cu',
        newPassword: 'mat-khau-moi-1',
      }),
    );
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveValue('');
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('');
    expect(screen.getByLabelText('Nhập lại mật khẩu mới')).toHaveValue('');
  });

  it('shows a specific message when the current password is wrong (401)', async () => {
    mockApi.patch.mockRejectedValue(new ApiError(401, 'Current password is incorrect'));
    render(<PasswordSection />);

    await fillForm('mat-khau-sai', 'mat-khau-moi-1', 'mat-khau-moi-1');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mật khẩu hiện tại không đúng');
  });

  it('shows the server message for other errors', async () => {
    mockApi.patch.mockRejectedValue(new ApiError(429, 'Too many attempts, try again later'));
    render(<PasswordSection />);

    await fillForm('mat-khau-cu', 'mat-khau-moi-1', 'mat-khau-moi-1');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts, try again later',
    );
  });
});
