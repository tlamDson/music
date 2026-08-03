import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateStoreDialog from '../../src/components/store/CreateStoreDialog';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { post: jest.fn() },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('CreateStoreDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<CreateStoreDialog open={false} onClose={jest.fn()} onCreated={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('submits the trimmed name and calls onCreated', async () => {
    mockApi.post.mockResolvedValue({ id: 'new-store' });
    const onCreated = jest.fn();

    render(<CreateStoreDialog open onClose={jest.fn()} onCreated={onCreated} />);

    const dialog = screen.getByRole('dialog', { name: 'Thêm quán' });
    await userEvent.type(within(dialog).getByLabelText('Tên quán'), '  Quán mới  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm quán' }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/stores', { name: 'Quán mới' }));
    expect(onCreated).toHaveBeenCalled();
  });

  it('does not submit an empty name', async () => {
    render(<CreateStoreDialog open onClose={jest.fn()} onCreated={jest.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Thêm quán' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm quán' }));

    expect(mockApi.post).not.toHaveBeenCalled();
  });
});
