import { render, screen } from '@testing-library/react';
import PlayerPage from '../../src/app/player/[storeId]/page';
import { useSync } from '../../src/hooks/useSync';
import { usePlayer } from '../../src/components/player/PlayerProvider';

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
    } as ReturnType<typeof usePlayer>);
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
});
