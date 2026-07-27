import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayerPage from '../../src/app/player/[storeId]/page';
import { useSync } from '../../src/hooks/useSync';
import { usePlayer, usePlayerPosition } from '../../src/components/player/PlayerProvider';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/hooks/useSync', () => ({ useSync: jest.fn() }));
jest.mock('../../src/components/player/PlayerProvider', () => ({
  usePlayer: jest.fn(),
  usePlayerPosition: jest.fn(),
}));

const mockSearchParams = { get: jest.fn() };
jest.mock('next/navigation', () => ({
  useParams: () => ({ storeId: 'store-1' }),
  useSearchParams: () => mockSearchParams,
}));

const mockUseSync = useSync as jest.MockedFunction<typeof useSync>;
const mockUsePlayer = usePlayer as jest.MockedFunction<typeof usePlayer>;
const mockUsePlayerPosition = usePlayerPosition as jest.MockedFunction<typeof usePlayerPosition>;
const mockApi = api as jest.Mocked<typeof api>;

describe('player screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSync.mockReturnValue({
      isConnected: true,
      nowPlaying: null,
      storeQueue: null,
      playlistId: null,
      repeat: 'OFF',
      shuffle: false,
    } as ReturnType<typeof useSync>);
    mockUsePlayer.mockReturnValue({
      current: { id: 'track-1', title: 'Cà phê sáng', url: 'https://s3/1.mp3' },
      isPlaying: true,
      durationMs: 180_000,
      mode: 'local',
      pause: jest.fn(),
    } as unknown as ReturnType<typeof usePlayer>);
    mockUsePlayerPosition.mockReturnValue(0);
  });

  // Màn chiếu treo trong quán: chỉ để nhìn, nhân viên không bấm nhầm được
  it('offers no controls in kiosk mode', () => {
    mockSearchParams.get.mockReturnValue('1');

    render(<PlayerPage />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('offers a pause control outside kiosk mode', () => {
    mockSearchParams.get.mockReturnValue(null);

    render(<PlayerPage />);

    expect(screen.getByRole('button', { name: /tạm dừng/i })).toBeInTheDocument();
  });

  it('shows the connection state on screen', () => {
    mockSearchParams.get.mockReturnValue('1');

    render(<PlayerPage />);

    expect(screen.getByText(/đã kết nối/i)).toBeInTheDocument();
  });

  // Đang nghe thử thì quán không có state trên server — gọi
  // /sync/stores/:id/pause sẽ 404, nên nút Tạm dừng luôn báo lỗi dù bấm đúng.
  it('pauses locally without hitting the API when only previewing', async () => {
    mockSearchParams.get.mockReturnValue(null);
    const pauseFn = jest.fn();
    mockUsePlayer.mockReturnValue({
      current: { id: 'track-1', title: 'Cà phê sáng', url: 'https://s3/1.mp3' },
      isPlaying: true,
      durationMs: 180_000,
      mode: 'preview',
      pause: pauseFn,
    } as unknown as ReturnType<typeof usePlayer>);

    render(<PlayerPage />);
    await userEvent.click(screen.getByRole('button', { name: /tạm dừng/i }));

    expect(pauseFn).toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalledWith('/sync/stores/store-1/pause');
  });

  // Quán đang thực sự phát thì pause phải qua server để broadcast
  // `store-paused` cho các màn hình khác của chính quán đó.
  it('asks the server to pause when the store is actually playing', async () => {
    mockSearchParams.get.mockReturnValue(null);
    const pauseFn = jest.fn();
    mockApi.post.mockResolvedValue(undefined);
    mockUsePlayer.mockReturnValue({
      current: { id: 'track-1', title: 'Cà phê sáng', url: 'https://s3/1.mp3' },
      isPlaying: true,
      durationMs: 180_000,
      mode: 'store',
      pause: pauseFn,
    } as unknown as ReturnType<typeof usePlayer>);

    render(<PlayerPage />);
    await userEvent.click(screen.getByRole('button', { name: /tạm dừng/i }));

    expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/pause');
    expect(pauseFn).not.toHaveBeenCalled();
  });
});
