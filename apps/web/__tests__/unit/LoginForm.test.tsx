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

  it('should render email and password fields', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('should call login with valid credentials on submit', async () => {
    mockLogin.mockResolvedValue({ role: 'ORG_ADMIN' });
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@cafe.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'Admin@123456');
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
    await userEvent.type(screen.getByLabelText(/password/i), 'WrongPass123');
    fireEvent.submit(screen.getByRole('form'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});
