import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import PlaylistEditorPage from '../../src/app/dashboard/playlists/[id]/page';
import { api } from '../../src/lib/api-client';
import { toast } from 'sonner';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'playlist-1' }),
}));

jest.mock('../../src/lib/api-client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

const track = (id: string, title: string) => ({
  id,
  title,
  artist: null,
  durationMs: 0,
  source: 'SELF_HOSTED',
  s3Key: `${id}.mp3`,
  externalProvider: null,
  externalId: null,
  organizationId: 'org-1',
  createdAt: '',
});

const playlistDetail = {
  id: 'playlist-1',
  name: 'Morning Chill',
  scope: 'ORG',
  playlistTracks: [
    {
      id: 'pt-1',
      playlistId: 'playlist-1',
      trackId: 'track-1',
      position: 0,
      track: track('track-1', 'Song One'),
    },
  ],
};

describe('PlaylistEditorPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/playlists/playlist-1') return Promise.resolve(playlistDetail);
      if (path === '/tracks')
        return Promise.resolve({
          data: [track('track-1', 'Song One'), track('track-2', 'Song Two')],
        });
      return Promise.resolve({ data: [] });
    });
  });

  it('should render playlist name, its tracks, and the track library', async () => {
    render(<PlaylistEditorPage />);

    await waitFor(() => expect(screen.getByText('Morning Chill')).toBeInTheDocument());
    expect(await screen.findByText('Song Two')).toBeInTheDocument();
    expect(screen.getAllByText('Song One').length).toBeGreaterThanOrEqual(1);
  });

  it('should add a library track to the playlist and toast success', async () => {
    mockApi.post.mockResolvedValue({ id: 'pt-2' });

    render(<PlaylistEditorPage />);
    const addBtn = await screen.findByRole('button', { name: /add song two/i });
    fireEvent.click(addBtn);

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/playlists/playlist-1/tracks', {
        trackId: 'track-2',
      }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('should add a track when dropped from the library onto the playlist', async () => {
    mockApi.post.mockResolvedValue({ id: 'pt-2' });

    render(<PlaylistEditorPage />);
    const dropZone = await screen.findByLabelText(/playlist tracks/i);

    fireEvent.drop(dropZone, {
      dataTransfer: { getData: (key: string) => (key === 'trackId' ? 'track-2' : '') },
    });

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/playlists/playlist-1/tracks', {
        trackId: 'track-2',
      }),
    );
  });

  it('should remove a track from the playlist', async () => {
    mockApi.delete.mockResolvedValue({ message: 'ok' });

    render(<PlaylistEditorPage />);
    const removeBtn = await screen.findByRole('button', { name: /remove song one/i });
    fireEvent.click(removeBtn);

    await waitFor(() =>
      expect(mockApi.delete).toHaveBeenCalledWith('/playlists/playlist-1/tracks/track-1'),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
