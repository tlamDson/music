import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '../../src/components/LoginForm';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockLogin = jest.fn();
jest.mock('../../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, login: mockLogin, logout: jest.fn() }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Store admin có console riêng, không dùng chung dashboard của chuỗi
  it('should send a store admin to the store console after login', async () => {
    mockLogin.mockResolvedValue({ role: 'STORE_ADMIN', storeId: 'store-1' });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'store1@cafe.com');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Store@123456');
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/store'));
  });

  it('should send an org admin to the chain dashboard after login', async () => {
    mockLogin.mockResolvedValue({ role: 'ORG_ADMIN', storeId: null });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@cafe.com');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Admin@123456');
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('should render email and password fields', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Mật khẩu')).toBeInTheDocument();
  });

  it('should call login with valid credentials on submit', async () => {
    mockLogin.mockResolvedValue({ role: 'ORG_ADMIN' });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@cafe.com');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'Admin@123456');
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'admin@cafe.com',
        password: 'Admin@123456',
      });
    });
  });

  it('should show error message on failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'wrong@cafe.com');
    await userEvent.type(screen.getByLabelText('Mật khẩu'), 'WrongPass123');
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
