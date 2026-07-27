import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlaylistDetail from '../../src/components/playlist/PlaylistDetail';
import { renderWithPlayer } from '../utils/renderWithPlayer';
import { api } from '../../src/lib/api-client';
import { toast } from 'sonner';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockApi = api as jest.Mocked<typeof api>;

const track = (id: string, title: string, durationMs: number, artist: string | null = null) => ({
  id,
  title,
  artist,
  durationMs,
  source: 'SELF_HOSTED',
  s3Key: `${id}.mp3`,
  externalProvider: null,
  externalId: null,
  organizationId: 'org-1',
  createdAt: '',
});

const playlistDetail = {
  id: 'playlist-1',
  name: 'Nhạc Lofi Chill Việt Nam',
  scope: 'ORG',
  storeId: null,
  playlistTracks: [
    {
      id: 'pt-1',
      playlistId: 'playlist-1',
      trackId: 'track-1',
      position: 0,
      addedAt: '2026-07-20T10:00:00.000Z',
      track: track('track-1', 'Hẹn Em Ở Lần Yêu Thứ 2', 366_000, 'Nguyenn'),
    },
    {
      id: 'pt-2',
      playlistId: 'playlist-1',
      trackId: 'track-2',
      position: 1,
      addedAt: '2026-07-25T10:00:00.000Z',
      track: track('track-2', 'Rồi Sẽ Đến Nơi', 215_000, 'JUUN D'),
    },
  ],
};

// PlayerProvider dựng `new Audio()` — jsdom không implement play(), mock tối thiểu.
class MockAudio {
  src = '';
  currentTime = 0;
  duration = 180;
  volume = 1;
  paused = true;
  addEventListener() {}
  removeEventListener() {}
  play = jest.fn(async () => {
    this.paused = false;
  });
  pause = jest.fn(() => {
    this.paused = true;
  });
}
Object.defineProperty(global, 'Audio', { writable: true, value: MockAudio });

describe('PlaylistDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/playlists/playlist-1') return Promise.resolve(playlistDetail);
      if (path.includes('/stream-url')) {
        return Promise.resolve({ url: 'https://s3/preview.mp3' });
      }
      if (path.startsWith('/tracks')) {
        return Promise.resolve({
          data: [
            track('track-1', 'Hẹn Em Ở Lần Yêu Thứ 2', 366_000, 'Nguyenn'),
            track('track-3', 'Gonna be you', 258_000, 'Linh Ka'),
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  const renderDetail = (role: 'ORG_ADMIN' | 'STORE_ADMIN' = 'ORG_ADMIN') =>
    renderWithPlayer(
      <PlaylistDetail
        playlistId="playlist-1"
        role={role}
        storeId={role === 'STORE_ADMIN' ? 'store-1' : null}
        backHref="/dashboard/playlists"
      />,
    );

  it('shows the playlist header with scope, track count and total length', async () => {
    renderDetail();

    expect(
      await screen.findByRole('heading', { name: 'Nhạc Lofi Chill Việt Nam' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/danh sách phát của chuỗi/i)).toBeInTheDocument();
    expect(screen.getByText(/2 bài · 10 phút/i)).toBeInTheDocument();
  });

  it('lists tracks with position, artist and duration', async () => {
    renderDetail();

    const row = await screen.findByRole('row', { name: /hẹn em ở lần yêu thứ 2/i });
    expect(row).toHaveTextContent('1');
    expect(row).toHaveTextContent('Nguyenn');
    expect(row).toHaveTextContent('6:06');
  });

  // Cột "Ngày thêm" chỉ có ở bảng track trong playlist (PlaylistTrack.addedAt),
  // không có ở kho nhạc chung.
  it('shows the "added on" date for each playlist track', async () => {
    renderDetail();

    const row = await screen.findByRole('row', { name: /hẹn em ở lần yêu thứ 2/i });
    expect(row).toHaveTextContent('20/07/2026');
  });

  // Admin chuỗi chỉ nghe thử tại chỗ — muốn phát ra loa quán thì vào
  // /dashboard/stores/[id]. Bấm ở đây mà broadcast là phát nhầm ra cả chuỗi.
  it('chỉ nghe thử tại chỗ khi admin chuỗi bấm phát, không gọi lệnh phát nào', async () => {
    mockApi.post.mockResolvedValue({});
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: /phát playlist/i }));

    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/tracks/track-1/stream-url'));
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('nghe thử đúng bài được bấm', async () => {
    mockApi.post.mockResolvedValue({});
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: /phát rồi sẽ đến nơi/i }));

    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/tracks/track-2/stream-url'));
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  // Quán bấm phát là phát thật ra loa quán mình
  it('plays at the store when a store admin opens the playlist', async () => {
    mockApi.post.mockResolvedValue({});
    renderDetail('STORE_ADMIN');

    await userEvent.click(await screen.findByRole('button', { name: /phát playlist/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/play', {
        playlistId: 'playlist-1',
        trackIndex: 0,
      }),
    );
  });

  it('adds a track from the add-song dialog', async () => {
    mockApi.post.mockResolvedValue({ id: 'pt-3' });
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: /thêm bài hát/i }));
    await userEvent.click(await screen.findByRole('button', { name: /thêm gonna be you/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/playlists/playlist-1/tracks', {
        trackId: 'track-3',
      }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it('still accepts a track dropped onto the list', async () => {
    mockApi.post.mockResolvedValue({ id: 'pt-3' });
    renderDetail();

    const dropZone = await screen.findByLabelText(/danh sách bài hát/i);
    fireEvent.drop(dropZone, {
      dataTransfer: { getData: (key: string) => (key === 'trackId' ? 'track-3' : '') },
    });

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/playlists/playlist-1/tracks', {
        trackId: 'track-3',
      }),
    );
  });

  it('removes a track from the playlist', async () => {
    mockApi.delete.mockResolvedValue({ message: 'ok' });
    renderDetail();

    await userEvent.click(
      await screen.findByRole('button', { name: /xóa hẹn em ở lần yêu thứ 2/i }),
    );

    await waitFor(() =>
      expect(mockApi.delete).toHaveBeenCalledWith('/playlists/playlist-1/tracks/track-1'),
    );
  });

  it('saves the new order after a drag', async () => {
    mockApi.patch.mockResolvedValue(playlistDetail);
    renderDetail();

    const rows = await screen.findAllByRole('row');
    // Kéo bài thứ hai lên đầu danh sách
    fireEvent.dragStart(rows[2]);
    fireEvent.drop(rows[1]);

    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith('/playlists/playlist-1/tracks/reorder', {
        trackIds: ['track-2', 'track-1'],
      }),
    );
  });
});
