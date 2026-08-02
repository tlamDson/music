import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateUserDialog from '../../src/components/users/CreateUserDialog';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { post: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

const stores = [{ id: 'store-1', name: 'Quán Nguyễn Huệ' }];

describe('CreateUserDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(
      <CreateUserDialog open={false} stores={stores} onClose={jest.fn()} onCreated={jest.fn()} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits the form and calls onCreated', async () => {
    mockApi.post.mockResolvedValue({ id: 'new-user' });
    const onCreated = jest.fn();

    render(<CreateUserDialog open stores={stores} onClose={jest.fn()} onCreated={onCreated} />);

    const dialog = screen.getByRole('dialog', { name: 'Thêm người dùng' });
    await userEvent.type(within(dialog).getByLabelText('Họ tên'), 'Nhân viên mới');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'new@cafe.com');
    await userEvent.type(within(dialog).getByLabelText('Mật khẩu'), 'mat-khau-12');
    await userEvent.selectOptions(within(dialog).getByLabelText('Quán'), 'store-1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/users', {
        email: 'new@cafe.com',
        password: 'mat-khau-12',
        name: 'Nhân viên mới',
        role: 'STORE_ADMIN',
        storeId: 'store-1',
      }),
    );
    expect(onCreated).toHaveBeenCalled();
  });

  it('shows an error and does not close when creation fails', async () => {
    mockApi.post.mockRejectedValue(new Error('Email đã tồn tại'));
    const onCreated = jest.fn();

    render(<CreateUserDialog open stores={stores} onClose={jest.fn()} onCreated={onCreated} />);

    const dialog = screen.getByRole('dialog', { name: 'Thêm người dùng' });
    await userEvent.type(within(dialog).getByLabelText('Họ tên'), 'Nhân viên mới');
    await userEvent.type(within(dialog).getByLabelText('Email'), 'new@cafe.com');
    await userEvent.type(within(dialog).getByLabelText('Mật khẩu'), 'mat-khau-12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tạo tài khoản' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Email đã tồn tại');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('does not show the store field when role is ORG_ADMIN', async () => {
    render(<CreateUserDialog open stores={stores} onClose={jest.fn()} onCreated={jest.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Thêm người dùng' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Vai trò'), 'ORG_ADMIN');
    expect(within(dialog).queryByLabelText('Quán')).not.toBeInTheDocument();
  });
});
