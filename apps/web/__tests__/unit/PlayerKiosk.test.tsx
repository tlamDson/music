import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayerPage from '../../src/app/player/[storeId]/page';
import { useSync } from '../../src/hooks/useSync';
import { usePlayer } from '../../src/components/player/PlayerProvider';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/hooks/useSync', () => ({ useSync: jest.fn() }));
jest.mock('../../src/components/player/PlayerProvider', () => ({ usePlayer: jest.fn() }));

const mockSearchParams = { get: jest.fn() };
jest.mock('next/navigation', () => ({
  useParams: () => ({ storeId: 'store-1' }),
  useSearchParams: () => mockSearchParams,
}));

const mockUseSync = useSync as jest.MockedFunction<typeof useSync>;
const mockUsePlayer = usePlayer as jest.MockedFunction<typeof usePlayer>;
const mockApi = api as jest.Mocked<typeof api>;

describe('player screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSync.mockReturnValue({
      isConnected: true,
      nowPlaying: null,
      storeQueue: null,
    } as ReturnType<typeof useSync>);
    mockUsePlayer.mockReturnValue({
      current: { id: 'track-1', title: 'Cà phê sáng', url: 'https://s3/1.mp3' },
      isPlaying: true,
      positionMs: 0,
      durationMs: 180_000,
      mode: 'local',
      pause: jest.fn(),
    } as unknown as ReturnType<typeof usePlayer>);
  });

  // Màn chiếu treo trong quán: chỉ để nhìn, nhân viên không bấm nhầm được
  it('offers no controls in kiosk mode', () => {
    mockSearchParams.get.mockReturnValue('1');

    render(<PlayerPage />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('offers rejoin and pause controls outside kiosk mode', () => {
    mockSearchParams.get.mockReturnValue(null);

    render(<PlayerPage />);

    expect(screen.getByRole('button', { name: /quay lại nhóm sync/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tạm dừng/i })).toBeInTheDocument();
  });

  it('shows the connection state on screen', () => {
    mockSearchParams.get.mockReturnValue('1');

    render(<PlayerPage />);

    expect(screen.getByText(/đã kết nối/i)).toBeInTheDocument();
  });

  // Quán đang theo nhóm không có StorePlaybackState riêng — gọi
  // /sync/stores/:id/pause sẽ 404 (backend: "Store is not playing locally"),
  // nên nút Tạm dừng luôn báo lỗi dù bấm đúng. Theo nhóm thì chỉ cần dừng cục bộ.
  it('pauses locally without hitting the API when following the sync group', async () => {
    mockSearchParams.get.mockReturnValue(null);
    const pauseFn = jest.fn();
    mockUsePlayer.mockReturnValue({
      current: { id: 'track-1', title: 'Cà phê sáng', url: 'https://s3/1.mp3' },
      isPlaying: true,
      positionMs: 0,
      durationMs: 180_000,
      mode: 'group',
      pause: pauseFn,
    } as unknown as ReturnType<typeof usePlayer>);

    render(<PlayerPage />);
    await userEvent.click(screen.getByRole('button', { name: /tạm dừng/i }));

    expect(pauseFn).toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalledWith('/sync/stores/store-1/pause');
  });

  // Quán đang phát hàng chờ riêng thì pause phải qua server để broadcast
  // `store-paused` cho các tab khác của chính quán đó (kiosk, tab admin xem).
  it('asks the server to pause when the store has its own local queue', async () => {
    mockSearchParams.get.mockReturnValue(null);
    const pauseFn = jest.fn();
    mockApi.post.mockResolvedValue(undefined);
    mockUsePlayer.mockReturnValue({
      current: { id: 'track-1', title: 'Cà phê sáng', url: 'https://s3/1.mp3' },
      isPlaying: true,
      positionMs: 0,
      durationMs: 180_000,
      mode: 'local',
      pause: pauseFn,
    } as unknown as ReturnType<typeof usePlayer>);

    render(<PlayerPage />);
    await userEvent.click(screen.getByRole('button', { name: /tạm dừng/i }));

    expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/pause');
    expect(pauseFn).not.toHaveBeenCalled();
  });
});
