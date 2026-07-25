import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeactivateUserDialog from '../../src/components/users/DeactivateUserDialog';

describe('DeactivateUserDialog', () => {
  const user = {
    id: 'user-1',
    email: 'staff@cafe.com',
    name: 'Nguyễn Văn A',
    role: 'STORE_ADMIN',
    storeId: 'store-1',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('asks the admin to type the store name to confirm when the user has a store', () => {
    render(
      <DeactivateUserDialog
        open
        user={user}
        storeName="Quán Nguyễn Huệ"
        onClose={jest.fn()}
        onConfirmed={jest.fn()}
      />,
    );

    expect(screen.getByText(/Quán Nguyễn Huệ/)).toBeInTheDocument();
    expect(screen.getByLabelText(/gõ để xác nhận/i)).toBeInTheDocument();
  });

  it('falls back to asking for the user name when no store is assigned', () => {
    render(
      <DeactivateUserDialog
        open
        user={{ id: user.id, name: user.name }}
        storeName={null}
        onClose={jest.fn()}
        onConfirmed={jest.fn()}
      />,
    );

    expect(screen.getByText(/chưa được gán vào quán nào/i)).toBeInTheDocument();
    expect(screen.getAllByText(user.name, { selector: 'strong' }).length).toBeGreaterThan(0);
  });

  it('keeps the confirm button disabled until the typed text matches exactly', async () => {
    render(
      <DeactivateUserDialog
        open
        user={user}
        storeName="Quán Nguyễn Huệ"
        onClose={jest.fn()}
        onConfirmed={jest.fn()}
      />,
    );

    const input = screen.getByLabelText(/gõ để xác nhận/i);
    const confirmButton = screen.getByRole('button', { name: 'Vô hiệu hoá' });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(input, 'quán nguyễn huệ');
    expect(confirmButton).toBeDisabled();

    await userEvent.clear(input);
    await userEvent.type(input, 'Quán Nguyễn Huệ');
    expect(confirmButton).toBeEnabled();
  });

  it('calls onConfirmed with the user id once the store name is confirmed', async () => {
    const onConfirmed = jest.fn();
    render(
      <DeactivateUserDialog
        open
        user={user}
        storeName="Quán Nguyễn Huệ"
        onClose={jest.fn()}
        onConfirmed={onConfirmed}
      />,
    );

    await userEvent.type(screen.getByLabelText(/gõ để xác nhận/i), 'Quán Nguyễn Huệ');
    await userEvent.click(screen.getByRole('button', { name: 'Vô hiệu hoá' }));

    expect(onConfirmed).toHaveBeenCalledWith('user-1');
  });
});
