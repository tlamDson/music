import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoreHome from '../../src/components/store/StoreHome';
import { renderWithPlayer } from '../utils/renderWithPlayer';
import { PlayerProvider, usePlayer } from '../../src/components/player/PlayerProvider';
import { api } from '../../src/lib/api-client';
import { useStoreSync } from '../../src/components/sync/StoreSyncProvider';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// Socket sync giờ nằm ở `StoreSyncProvider` (layout) — StoreHome chỉ đọc context.
jest.mock('../../src/components/sync/StoreSyncProvider', () => ({
  useStoreSync: jest.fn(),
}));

const mockApi = api as jest.Mocked<typeof api>;
const mockUseStoreSync = useStoreSync as jest.MockedFunction<typeof useStoreSync>;

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

const playlistDetail = (
  id: string,
  name: string,
  tracks: Array<{ id: string; title: string; durationMs: number }>,
) => ({
  id,
  name,
  scope: 'ORG',
  storeId: null,
  playlistTracks: tracks.map((t, index) => ({
    id: `pt-${t.id}`,
    playlistId: id,
    trackId: t.id,
    position: index,
    addedAt: '2026-07-20T10:00:00.000Z',
    track: track(t.id, t.title, t.durationMs),
  })),
});

// PlayerProvider dựng `new Audio()` — jsdom không có, mock tối thiểu.
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

// Bơm một bài vào provider để giả lập "quán đang nghe theo nhóm"
function SeedPlaying() {
  const { playTrack } = usePlayer();
  return (
    <button
      onClick={() =>
        playTrack(
          { id: 'track-1', title: 'Hạ trắng', artist: 'Khánh Ly', url: 'https://s3/1.mp3' },
          { mode: 'store', storeId: 'store-1' },
        )
      }
    >
      seed
    </button>
  );
}

const syncState = (overrides: Partial<ReturnType<typeof useStoreSync>> = {}) =>
  ({
    isConnected: true,
    storeQueue: null,
    ...overrides,
  }) as ReturnType<typeof useStoreSync>;

describe('StoreHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStoreSync.mockReturnValue(syncState());
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('/status')) {
        return Promise.resolve({
          storeId: 'store-1',
          name: 'Quán Nguyễn Huệ',
          status: 'STOPPED',
          connectedScreens: 1,
        });
      }
      if (path === '/playlists/playlist-1') {
        return Promise.resolve(
          playlistDetail('playlist-1', 'Nhạc Lofi', [
            { id: 'track-1', title: 'Hạ trắng', durationMs: 200_000 },
            { id: 'track-2', title: 'Diễm xưa', durationMs: 180_000 },
            { id: 'track-3', title: 'Cát bụi', durationMs: 220_000 },
          ]),
        );
      }
      if (path === '/playlists/playlist-2') {
        return Promise.resolve(
          playlistDetail('playlist-2', 'Nhạc Chill', [
            { id: 'track-4', title: 'Mưa hồng', durationMs: 190_000 },
            { id: 'track-5', title: 'Biển nhớ', durationMs: 210_000 },
          ]),
        );
      }
      if (path === '/playlists') {
        return Promise.resolve({
          data: [
            {
              id: 'playlist-1',
              name: 'Nhạc Lofi',
              scope: 'ORG',
              _count: { playlistTracks: 3 },
              totalDurationMs: 600_000,
            },
            {
              id: 'playlist-2',
              name: 'Nhạc Chill',
              scope: 'ORG',
              _count: { playlistTracks: 2 },
              totalDurationMs: 400_000,
            },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  const renderHome = () => renderWithPlayer(<StoreHome storeId="store-1" />);

  it('shows the store name and that it is idle', async () => {
    renderHome();

    expect(await screen.findByText('Quán Nguyễn Huệ')).toBeInTheDocument();
    expect(screen.getByText(/quán đang im lặng/i)).toBeInTheDocument();
  });

  it('warns when the socket is disconnected', async () => {
    mockUseStoreSync.mockReturnValue(syncState({ isConnected: false }));
    renderHome();

    expect(await screen.findByText(/mất kết nối/i)).toBeInTheDocument();
  });

  // Nhân viên quán cần thấy còn mấy bài nữa trong hàng chờ
  it('shows how many tracks remain in the queue', async () => {
    mockUseStoreSync.mockReturnValue(
      syncState({ storeQueue: { index: 0, total: 3, remaining: 2 } }),
    );
    renderHome();

    expect(await screen.findByText(/còn 2 bài/i)).toBeInTheDocument();
  });

  // Điều QC báo thiếu: bấm phát ở dashboard xong quán phải thấy bài đang chạy
  it('shows the currently playing track name from the shared player', async () => {
    render(
      <PlayerProvider>
        <SeedPlaying />
        <StoreHome storeId="store-1" />
      </PlayerProvider>,
    );

    await screen.findByText('Quán Nguyễn Huệ');
    await userEvent.click(screen.getByText('seed'));

    expect(await screen.findByText('Hạ trắng')).toBeInTheDocument();
    expect(screen.getByText(/đang phát tại quán/i)).toBeInTheDocument();
  });

  it('plays a suggested playlist through the store endpoint', async () => {
    mockApi.post.mockResolvedValue({});
    renderHome();

    await userEvent.click(await screen.findByRole('button', { name: /phát nhạc lofi/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/play', {
        playlistId: 'playlist-1',
        trackIndex: 0,
      }),
    );
  });

  // Khoảng trống người dùng chỉ ra: muốn xem playlist có bài gì phải rời trang.
  it('shows the track list of the currently playing playlist with a summary', async () => {
    mockUseStoreSync.mockReturnValue(syncState({ playlistId: 'playlist-1' }));
    renderHome();

    expect(await screen.findByText('Hạ trắng')).toBeInTheDocument();
    expect(screen.getByText('Diễm xưa')).toBeInTheDocument();
    expect(screen.getByText('Cát bụi')).toBeInTheDocument();
    expect(screen.getByText(/^3 bài · 10 phút$/i)).toBeInTheDocument();
  });

  it('highlights the currently playing track in the list', async () => {
    mockUseStoreSync.mockReturnValue(syncState({ playlistId: 'playlist-1' }));

    render(
      <PlayerProvider>
        <SeedPlaying />
        <StoreHome storeId="store-1" />
      </PlayerProvider>,
    );

    await screen.findByText('Hạ trắng');
    await userEvent.click(screen.getByText('seed'));

    expect(await screen.findByRole('button', { name: /tạm dừng hạ trắng/i })).toBeInTheDocument();
  });

  it('plays the exact track clicked from the currently playing playlist', async () => {
    mockUseStoreSync.mockReturnValue(syncState({ playlistId: 'playlist-1' }));
    mockApi.post.mockResolvedValue({});
    renderHome();

    await userEvent.click(await screen.findByRole('button', { name: /phát cát bụi/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/play', {
        playlistId: 'playlist-1',
        trackIndex: 2,
      }),
    );
  });

  // Playlist chưa phát vẫn phải bung được để chọn bài bắt đầu, không rời trang.
  it('expands a playlist that is not currently playing to load and show its tracks', async () => {
    renderHome();

    await userEvent.click(
      await screen.findByRole('button', { name: /xem danh sách bài của nhạc chill/i }),
    );

    expect(await screen.findByText('Mưa hồng')).toBeInTheDocument();
    expect(screen.getByText('Biển nhớ')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /phát biển nhớ/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/play', {
        playlistId: 'playlist-2',
        trackIndex: 1,
      }),
    );
  });
});
