import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoreDetail from '../../src/components/store/StoreDetail';
import { renderWithPlayer } from '../utils/renderWithPlayer';
import { PlayerProvider, usePlayer } from '../../src/components/player/PlayerProvider';
import { api } from '../../src/lib/api-client';
import { useStoresSync } from '../../src/components/sync/StoresSyncBridge';

jest.mock('../../src/lib/api-client', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// Bridge mở socket cho mọi quán ở dashboard — StoreDetail chỉ đọc trạng thái
// của đúng quán đang xem để cập nhật ngay, không đợi tới lần poll 10s kế tiếp.
jest.mock('../../src/components/sync/StoresSyncBridge', () => ({
  useStoresSync: jest.fn(),
}));

const mockApi = api as jest.Mocked<typeof api>;
const mockUseStoresSync = useStoresSync as jest.MockedFunction<typeof useStoresSync>;

// PlayerProvider dựng `new Audio()` — jsdom không implement play(), mock tối
// thiểu (giống StoreHome.test.tsx / TrackTable.test.tsx) để `isPlaying` lên
// true, cần thiết cho test đánh dấu bài đang phát.
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

const defaultBridgeState = () =>
  ({
    isConnected: true,
    storeQueue: null,
    playlistId: null,
    repeat: 'OFF',
    shuffle: false,
  }) as ReturnType<typeof useStoresSync>;

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

const playlists = [
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
];

const nowPlaying = {
  storeId: 'store-1',
  playlistId: 'playlist-1',
  track: { id: 'track-1', title: 'Cà phê sáng', artist: 'Vũ', durationMs: 180_000 },
  trackUrl: 'https://s3/a.mp3',
  positionMs: 12_000,
  serverTs: Date.now(),
  isPlaying: true,
  queue: { index: 0, total: 3, remaining: 2 },
  repeat: 'OFF',
  shuffle: false,
};

const storeResponse = (overrides: Record<string, unknown> = {}) => ({
  id: 'store-1',
  name: 'Quán Nguyễn Huệ',
  status: 'PLAYING',
  nowPlaying,
  connectedScreens: 2,
  ...overrides,
});

function mockGet(store: Record<string, unknown>) {
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/stores/store-1') return Promise.resolve(store);
    if (path === '/playlists/playlist-1') {
      return Promise.resolve(
        playlistDetail('playlist-1', 'Nhạc Lofi', [
          { id: 'track-1', title: 'Cà phê sáng', durationMs: 180_000 },
          { id: 'track-2', title: 'Chiều hoang', durationMs: 200_000 },
          { id: 'track-3', title: 'Đêm buồn', durationMs: 220_000 },
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
    if (path === '/playlists') return Promise.resolve({ data: playlists });
    return Promise.resolve({ data: playlists });
  });
}

describe('StoreDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.post.mockResolvedValue({});
    mockGet(storeResponse());
    mockUseStoresSync.mockReturnValue(defaultBridgeState());
  });

  const renderDetail = () => renderWithPlayer(<StoreDetail storeId="store-1" />);

  it('hiện tên quán và số màn hình đang kết nối', async () => {
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Quán Nguyễn Huệ' })).toBeInTheDocument();
    expect(screen.getByText(/2 màn hình đang kết nối/i)).toBeInTheDocument();
  });

  // Admin bấm phát mà không quán nào nghe được là bug hay gặp nhất — phải nói rõ
  it('cảnh báo khi chưa có màn hình nào kết nối', async () => {
    mockGet(storeResponse({ connectedScreens: 0 }));
    renderDetail();

    expect(await screen.findByText(/chưa có màn hình nào kết nối/i)).toBeInTheDocument();
  });

  it('hiện bài đang phát và số bài còn trong hàng chờ', async () => {
    renderDetail();

    // Tên bài giờ hiện cả ở khối tóm tắt lẫn trong bảng track bên dưới.
    expect((await screen.findAllByText('Cà phê sáng')).length).toBeGreaterThan(0);
    expect(screen.getByText(/còn 2 bài trong hàng chờ/i)).toBeInTheDocument();
  });

  // Đây là điểm mấu chốt của cả đợt refactor: phát nhạc ra quán chỉ làm được ở đây
  it('phát playlist cho đúng quán này', async () => {
    renderDetail();

    await userEvent.click(
      await screen.findByRole('button', { name: /phát nhạc lofi tại quán nguyễn huệ/i }),
    );

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/play', {
        playlistId: 'playlist-1',
        trackIndex: 0,
      }),
    );
  });

  it('tạm dừng và chuyển bài qua server', async () => {
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: /tạm dừng/i }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/pause'));

    await userEvent.click(screen.getByRole('button', { name: /bài sau/i }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/next'));
  });

  // QC: nút chuyển bài ở hai đầu hàng chờ đá admin ra khỏi playlist — bấm "Bài
  // sau" ở bài cuối làm server dừng hẳn quán. Hết chỗ để đi thì bỏ nút hẳn.
  describe('hai đầu hàng chờ', () => {
    it('không có "Bài trước" ở bài đầu', async () => {
      renderDetail();

      expect(await screen.findByRole('button', { name: /bài sau/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /bài trước/i })).not.toBeInTheDocument();
    });

    it('không có "Bài sau" ở bài cuối', async () => {
      mockGet(
        storeResponse({
          nowPlaying: { ...nowPlaying, queue: { index: 2, total: 3, remaining: 0 } },
        }),
      );
      renderDetail();

      expect(await screen.findByRole('button', { name: /bài trước/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /bài sau/i })).not.toBeInTheDocument();
    });

    it('quay lại bài trước qua server khi đang ở giữa hàng chờ', async () => {
      mockGet(
        storeResponse({
          nowPlaying: { ...nowPlaying, queue: { index: 1, total: 3, remaining: 1 } },
        }),
      );
      renderDetail();

      await userEvent.click(await screen.findByRole('button', { name: /bài trước/i }));

      await waitFor(() =>
        expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/previous'),
      );
    });

    it('hiện lại cả hai nút khi quán đang lặp cả danh sách', async () => {
      mockUseStoresSync.mockReturnValue({
        ...defaultBridgeState(),
        repeat: 'ALL',
      } as ReturnType<typeof useStoresSync>);
      mockGet(
        storeResponse({
          nowPlaying: { ...nowPlaying, queue: { index: 2, total: 3, remaining: 0 } },
        }),
      );
      renderDetail();

      expect(await screen.findByRole('button', { name: /bài trước/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /bài sau/i })).toBeInTheDocument();
    });
  });

  it('đổi nút thành "Phát tiếp" khi quán đang tạm dừng', async () => {
    mockGet(storeResponse({ status: 'PAUSED', nowPlaying: { ...nowPlaying, isPlaying: false } }));
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: /phát tiếp/i }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/resume'));
  });

  it('mời chọn playlist khi quán đang im lặng', async () => {
    mockGet(storeResponse({ status: 'STOPPED', nowPlaying: null }));
    renderDetail();

    expect(await screen.findByText(/quán đang im lặng/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /bài sau/i })).not.toBeInTheDocument();
  });

  // Khoảng trống người dùng chỉ ra: muốn xem playlist có bài gì phải rời trang.
  it('hiện danh sách bài của playlist đang phát kèm tóm tắt', async () => {
    renderDetail();

    expect(await screen.findByText('Chiều hoang')).toBeInTheDocument();
    expect(screen.getByText('Đêm buồn')).toBeInTheDocument();
    expect(screen.getByText(/^3 bài · 10 phút$/i)).toBeInTheDocument();
  });

  it('đánh dấu đúng bài đang phát trong bảng track', async () => {
    function SeedPlaying() {
      const { playTrack } = usePlayer();
      return (
        <button
          onClick={() =>
            playTrack(
              { id: 'track-1', title: 'Cà phê sáng', artist: 'Vũ', url: 'https://s3/1.mp3' },
              { mode: 'store', storeId: 'store-1' },
            )
          }
        >
          seed
        </button>
      );
    }

    render(
      <PlayerProvider>
        <SeedPlaying />
        <StoreDetail storeId="store-1" />
      </PlayerProvider>,
    );

    await screen.findByText('Chiều hoang');
    await userEvent.click(screen.getByText('seed'));

    expect(
      await screen.findByRole('button', { name: /tạm dừng cà phê sáng/i }),
    ).toBeInTheDocument();
  });

  it('bấm đúng bài thứ 3 trong playlist đang phát là nhảy ngay tới bài đó', async () => {
    renderDetail();

    await userEvent.click(await screen.findByRole('button', { name: /phát đêm buồn/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/play', {
        playlistId: 'playlist-1',
        trackIndex: 2,
      }),
    );
  });

  // Playlist chưa phát vẫn phải bung được để chọn bài bắt đầu, không rời trang.
  it('bung playlist chưa phát để tải và hiện được bài', async () => {
    renderDetail();

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

  // Trọng tâm của bullet 3: đổi bài không còn phải chờ tới 10 giây poll kế
  // tiếp — bridge (`StoresSyncBridge`) báo hiệu là refetch ngay.
  it('refetch trạng thái quán ngay khi bridge báo hiệu đổi bài, không đợi poll 10 giây', async () => {
    const { rerender } = renderDetail();

    await screen.findByRole('heading', { name: 'Quán Nguyễn Huệ' });
    const callsAfterMount = mockApi.get.mock.calls.filter(
      ([path]) => path === '/stores/store-1',
    ).length;

    mockUseStoresSync.mockReturnValue({
      isConnected: true,
      storeQueue: { index: 1, total: 3, remaining: 1 },
      playlistId: 'playlist-1',
      repeat: 'OFF',
      shuffle: false,
    } as ReturnType<typeof useStoresSync>);

    rerender(
      <PlayerProvider>
        <StoreDetail storeId="store-1" />
      </PlayerProvider>,
    );

    await waitFor(() =>
      expect(
        mockApi.get.mock.calls.filter(([path]) => path === '/stores/store-1').length,
      ).toBeGreaterThan(callsAfterMount),
    );
  });
});
