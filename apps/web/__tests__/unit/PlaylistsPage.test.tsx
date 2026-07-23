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

  // Groupd id từng bị hardcode 'sync-group-main' — sai ngay khi chuỗi có nhóm khác
  it('should play a playlist on the sync group returned by the API', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/sync/groups')
        return Promise.resolve({
          data: [{ id: 'group-42', name: 'Nhóm chính', mode: 'LOOSE', status: 'STOPPED' }],
        });
      return Promise.resolve({
        data: [{ id: 'playlist-1', name: 'V-Pop', scope: 'ORG', _count: { playlistTracks: 3 } }],
      });
    });
    mockApi.post.mockResolvedValue({});

    render(<PlaylistsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /play all/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(
        '/sync/groups/group-42/play',
        expect.objectContaining({ playlistId: 'playlist-1' }),
      ),
    );
  });

  it('should warn instead of playing when no sync group exists', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/sync/groups') return Promise.resolve({ data: [] });
      return Promise.resolve({
        data: [{ id: 'playlist-1', name: 'V-Pop', scope: 'ORG', _count: { playlistTracks: 3 } }],
      });
    });

    render(<PlaylistsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /play all/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('should show error toast when create fails', async () => {
    mockApi.post.mockRejectedValue(new Error('boom'));

    render(<PlaylistsPage />);
    await userEvent.type(screen.getByLabelText(/playlist name/i), 'X');
    fireEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
