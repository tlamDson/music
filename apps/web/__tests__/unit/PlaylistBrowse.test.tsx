import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlaylistBrowse from '../../src/components/playlist/PlaylistBrowse';
import { renderWithPlayer } from '../utils/renderWithPlayer';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockApi = api as jest.Mocked<typeof api>;

const orgPlaylist = {
  id: 'playlist-1',
  name: 'Nhạc Lofi Chill Việt Nam',
  scope: 'ORG',
  storeId: null,
  _count: { playlistTracks: 98 },
  totalDurationMs: 25_200_000,
};

const storePlaylist = {
  id: 'playlist-2',
  name: 'Nhạc quán Nguyễn Huệ',
  scope: 'STORE',
  storeId: 'store-1',
  _count: { playlistTracks: 12 },
  totalDurationMs: 2_700_000,
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

describe('PlaylistBrowse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/playlists/playlist-1') {
        return Promise.resolve({
          playlistTracks: [
            {
              track: {
                id: 'track-1',
                title: 'Hẹn Em Ở Lần Yêu Thứ 2',
                artist: 'Nguyenn',
                durationMs: 366_000,
              },
            },
          ],
        });
      }
      if (path.includes('/stream-url')) {
        return Promise.resolve({ url: 'https://s3/preview.mp3' });
      }
      return Promise.resolve({ data: [orgPlaylist, storePlaylist] });
    });
  });

  const renderBrowse = (role: 'ORG_ADMIN' | 'STORE_ADMIN' = 'ORG_ADMIN') =>
    renderWithPlayer(
      <PlaylistBrowse
        role={role}
        storeId={role === 'STORE_ADMIN' ? 'store-1' : null}
        basePath="/dashboard/playlists"
      />,
    );

  it('groups playlists into a chain row and a store row', async () => {
    renderBrowse();

    expect(await screen.findByRole('heading', { name: /playlist của chuỗi/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /playlist của quán/i })).toBeInTheDocument();
    expect(screen.getByText('Nhạc Lofi Chill Việt Nam')).toBeInTheDocument();
  });

  it('shows the track count and total length on each card', async () => {
    renderBrowse();

    expect(await screen.findByText(/98 bài · khoảng 7 giờ/i)).toBeInTheDocument();
    expect(screen.getByText(/12 bài · 45 phút/i)).toBeInTheDocument();
  });

  it('asks the server for a single scope when a chip is picked', async () => {
    renderBrowse();
    await screen.findByText('Nhạc Lofi Chill Việt Nam');

    await userEvent.click(screen.getByRole('button', { name: /^chuỗi$/i }));

    await waitFor(() =>
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('scope=ORG')),
    );
  });

  it('searches playlists by name', async () => {
    renderBrowse();
    await screen.findByText('Nhạc Lofi Chill Việt Nam');

    fireEvent.change(screen.getByLabelText(/tìm playlist/i), { target: { value: 'lofi' } });

    await waitFor(() =>
      expect(mockApi.get).toHaveBeenCalledWith(expect.stringContaining('q=lofi')),
    );
  });

  // Admin chuỗi chỉ nghe thử tại chỗ — phát ra loa quán phải vào trang quán
  it('chỉ nghe thử tại chỗ cho admin chuỗi, không phát ra quán nào', async () => {
    mockApi.post.mockResolvedValue({});
    renderBrowse('ORG_ADMIN');
    await screen.findByText('Nhạc Lofi Chill Việt Nam');

    await userEvent.click(screen.getByRole('button', { name: /phát nhạc lofi chill việt nam/i }));

    await waitFor(() =>
      expect(mockApi.get).toHaveBeenCalledWith('/tracks/track-1/stream-url'),
    );
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  // Quán bấm phát là phát thật ra loa quán mình
  it('plays at the store for a store admin', async () => {
    mockApi.post.mockResolvedValue({});
    renderBrowse('STORE_ADMIN');
    await screen.findByText('Nhạc Lofi Chill Việt Nam');

    await userEvent.click(screen.getByRole('button', { name: /phát nhạc lofi chill việt nam/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(
        '/sync/stores/store-1/play',
        expect.objectContaining({ playlistId: 'playlist-1' }),
      ),
    );
  });

  it('creates an org-wide playlist from the chain console', async () => {
    mockApi.post.mockResolvedValue({ id: 'playlist-3' });
    renderBrowse('ORG_ADMIN');

    await userEvent.type(await screen.findByLabelText(/tên playlist/i), 'Ballad');
    await userEvent.click(screen.getByRole('button', { name: /tạo playlist/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/playlists', {
        name: 'Ballad',
        scope: 'ORG',
      }),
    );
  });

  it('creates a store-scoped playlist from the store console', async () => {
    mockApi.post.mockResolvedValue({ id: 'playlist-3' });
    renderBrowse('STORE_ADMIN');

    await userEvent.type(await screen.findByLabelText(/tên playlist/i), 'Nhạc sáng');
    await userEvent.click(screen.getByRole('button', { name: /tạo playlist/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/playlists', {
        name: 'Nhạc sáng',
        scope: 'STORE',
        storeId: 'store-1',
      }),
    );
  });

  it('deletes a playlist', async () => {
    mockApi.delete.mockResolvedValue({});
    renderBrowse('ORG_ADMIN');

    await userEvent.click(
      await screen.findByRole('button', { name: /xóa nhạc lofi chill việt nam/i }),
    );

    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith('/playlists/playlist-1'));
  });

  // Track chung của chuỗi là của tất cả quán — quán không được xóa
  it('does not offer a store admin the delete button on chain playlists', async () => {
    renderBrowse('STORE_ADMIN');
    await screen.findByText('Nhạc Lofi Chill Việt Nam');

    expect(
      screen.queryByRole('button', { name: /xóa nhạc lofi chill việt nam/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xóa nhạc quán nguyễn huệ/i })).toBeInTheDocument();
  });

  it('remembers what was played recently', async () => {
    mockApi.post.mockResolvedValue({});
    renderBrowse();
    await screen.findByText('Nhạc Lofi Chill Việt Nam');

    await userEvent.click(screen.getByRole('button', { name: /phát nhạc lofi chill việt nam/i }));

    await waitFor(() =>
      expect(window.localStorage.getItem('cafe-music:recent-playlists')).toContain('playlist-1'),
    );
  });
});
