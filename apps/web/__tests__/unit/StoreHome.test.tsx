import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoreHome from '../../src/components/store/StoreHome';
import { renderWithPlayer } from '../utils/renderWithPlayer';
import { api } from '../../src/lib/api-client';
import { useSync } from '../../src/hooks/useSync';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

jest.mock('../../src/hooks/useSync', () => ({ useSync: jest.fn() }));

const mockApi = api as jest.Mocked<typeof api>;
const mockUseSync = useSync as jest.MockedFunction<typeof useSync>;

const syncState = (overrides: Partial<ReturnType<typeof useSync>> = {}) =>
  ({
    isConnected: true,
    nowPlaying: null,
    groupState: null,
    isPlaying: false,
    storeQueue: null,
    ...overrides,
  }) as ReturnType<typeof useSync>;

describe('StoreHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSync.mockReturnValue(syncState());
    mockApi.get.mockImplementation((path: string) => {
      if (path.includes('/status')) {
        return Promise.resolve({
          storeId: 'store-1',
          name: 'Quán Nguyễn Huệ',
          syncGroupId: 'group-1',
          override: { isOverridden: false, overriddenAt: null },
        });
      }
      return Promise.resolve({
        data: [
          {
            id: 'playlist-1',
            name: 'Nhạc Lofi',
            scope: 'ORG',
            _count: { playlistTracks: 12 },
            totalDurationMs: 2_700_000,
          },
        ],
      });
    });
  });

  const renderHome = () => renderWithPlayer(<StoreHome storeId="store-1" />);

  it('shows the store name and that it follows the sync group', async () => {
    renderHome();

    expect(await screen.findByText('Quán Nguyễn Huệ')).toBeInTheDocument();
    expect(screen.getByText(/đang theo nhóm sync/i)).toBeInTheDocument();
  });

  it('warns when the socket is disconnected', async () => {
    mockUseSync.mockReturnValue(syncState({ isConnected: false }));
    renderHome();

    expect(await screen.findByText(/mất kết nối/i)).toBeInTheDocument();
  });

  // Đây là thứ nhân viên quán cần thấy: còn mấy bài nữa thì nhạc quay về dòng chung
  it('shows how many tracks remain before returning to the group', async () => {
    mockUseSync.mockReturnValue(syncState({ storeQueue: { index: 0, total: 3, remaining: 2 } }));
    renderHome();

    expect(await screen.findByText(/còn 2 bài/i)).toBeInTheDocument();
  });

  it('rejoins the sync group on demand', async () => {
    mockApi.post.mockResolvedValue({ rejoined: true });
    mockUseSync.mockReturnValue(syncState({ storeQueue: { index: 0, total: 3, remaining: 2 } }));
    renderHome();

    await userEvent.click(await screen.findByRole('button', { name: /quay lại nhóm sync ngay/i }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/rejoin'));
  });

  it('plays a suggested playlist through the store endpoint', async () => {
    mockApi.post.mockResolvedValue({});
    renderHome();

    await userEvent.click(await screen.findByRole('button', { name: /phát nhạc lofi/i }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/play', {
        playlistId: 'playlist-1',
        trackIndex: 0,
        returnToGroupOnFinish: true,
      }),
    );
  });
});
