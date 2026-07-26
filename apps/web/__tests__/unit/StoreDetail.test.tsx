import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoreDetail from '../../src/components/store/StoreDetail';
import { renderWithPlayer } from '../utils/renderWithPlayer';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockApi = api as jest.Mocked<typeof api>;

const playlists = [
  {
    id: 'playlist-1',
    name: 'Nhạc Lofi',
    scope: 'ORG',
    _count: { playlistTracks: 12 },
    totalDurationMs: 2_700_000,
  },
];

const nowPlaying = {
  storeId: 'store-1',
  track: { id: 'track-1', title: 'Cà phê sáng', artist: 'Vũ', durationMs: 180_000 },
  trackUrl: 'https://s3/a.mp3',
  positionMs: 12_000,
  serverTs: Date.now(),
  isPlaying: true,
  queue: { index: 0, total: 3, remaining: 2 },
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
    return Promise.resolve({ data: playlists });
  });
}

describe('StoreDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.post.mockResolvedValue({});
    mockGet(storeResponse());
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

    expect(await screen.findByText('Cà phê sáng')).toBeInTheDocument();
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
});
