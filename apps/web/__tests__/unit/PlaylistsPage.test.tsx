import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlaylistsPage from '../../src/app/dashboard/playlists/page';
import { api } from '../../src/lib/api-client';
import { toast } from 'sonner';

jest.mock('../../src/lib/api-client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

describe('PlaylistsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: [] });
  });

  it('should show success toast after creating a playlist', async () => {
    mockApi.post.mockResolvedValue({ id: 'playlist-1', name: 'Morning Chill' });

    render(<PlaylistsPage />);
    const input = screen.getByLabelText(/playlist name/i);
    await userEvent.type(input, 'Morning Chill');
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/playlists', {
        name: 'Morning Chill',
        scope: 'ORG',
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('should show error toast when create fails', async () => {
    mockApi.post.mockRejectedValue(new Error('boom'));

    render(<PlaylistsPage />);
    await userEvent.type(screen.getByLabelText(/playlist name/i), 'X');
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
