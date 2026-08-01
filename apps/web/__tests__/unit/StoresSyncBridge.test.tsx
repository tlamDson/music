import { render, screen, act, waitFor } from '@testing-library/react';
import StoresSyncBridge, {
  useStoresSync,
  focusedStoreIdFrom,
} from '../../src/components/sync/StoresSyncBridge';
import { usePlayer } from '../../src/components/player/PlayerProvider';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
const mockApiGet = api.get as jest.Mock;

let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

const playTrack = jest.fn();
const pauseStore = jest.fn();
const stopStore = jest.fn();
const setPlaybackMode = jest.fn();
jest.mock('../../src/components/player/PlayerProvider', () => ({
  usePlayer: jest.fn(),
}));
const mockUsePlayer = usePlayer as jest.Mock;

const mockSockets: Array<{
  on: jest.Mock;
  off: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
  listeners: Record<string, (...args: unknown[]) => void>;
}> = [];

function createMockSocket() {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  const socket = {
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb;
    }),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    listeners,
  };
  mockSockets.push(socket);
  return socket;
}

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => createMockSocket()),
}));

const measureOffset = jest.fn(async () => {});
jest.mock('../../src/hooks/useClockOffset', () => ({
  useClockOffset: () => ({ offset: 0, measureOffset }),
}));

function nowPlayingPayload(storeId: string, remaining: number) {
  return {
    storeId,
    trackId: `track-${storeId}`,
    track: {
      id: `track-${storeId}`,
      title: `Bài của ${storeId}`,
      artist: null,
      durationMs: 200_000,
    },
    trackUrl: `https://s3.local/${storeId}.mp3`,
    positionMs: 0,
    serverTs: Date.now(),
    queue: { index: 0, total: 2, remaining },
    repeat: 'OFF' as const,
    shuffle: false,
  };
}

/** Trang bất kỳ đọc trạng thái sync của một quán cụ thể qua bridge. */
function ReadStoreSync({ storeId }: { storeId: string }) {
  const state = useStoresSync(storeId);
  return (
    <div>
      <span>{state.isConnected ? 'connected' : 'offline'}</span>
      <span>{state.storeQueue ? `remaining:${state.storeQueue.remaining}` : 'no-queue'}</span>
      <span>{state.playlistId ? `playlist:${state.playlistId}` : 'no-playlist'}</span>
    </div>
  );
}

function nowPlayingSnapshot(storeId: string, playlistId: string) {
  return {
    storeId,
    playlistId,
    track: { id: `track-${storeId}`, title: storeId, artist: null, durationMs: 100_000 },
    trackUrl: `https://s3/${storeId}.mp3`,
    positionMs: 0,
    serverTs: Date.now(),
    isPlaying: true,
    queue: { index: 0, total: 1, remaining: 0 },
    repeat: 'OFF',
    shuffle: false,
  };
}

describe('StoresSyncBridge / useStoresSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSockets.length = 0;
    mockPathname = '/dashboard';
    mockUsePlayer.mockReturnValue({ playTrack, pauseStore, stopStore, setPlaybackMode });
    localStorage.setItem('accessToken', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('focusedStoreIdFrom', () => {
    it('chỉ nhận trang chi tiết quán, không nhận trang danh sách', () => {
      expect(focusedStoreIdFrom('/dashboard/stores/store-1')).toBe('store-1');
      expect(focusedStoreIdFrom('/dashboard/stores/store-1/anything')).toBe('store-1');
      expect(focusedStoreIdFrom('/dashboard/stores')).toBeNull();
      expect(focusedStoreIdFrom('/dashboard')).toBeNull();
      expect(focusedStoreIdFrom('/dashboard/playlists')).toBeNull();
      expect(focusedStoreIdFrom(null)).toBeNull();
    });
  });

  it('trả về trạng thái mặc định khi quán chưa có socket nào báo cáo', () => {
    render(<ReadStoreSync storeId="store-1" />);

    expect(screen.getByText('offline')).toBeInTheDocument();
    expect(screen.getByText('no-queue')).toBeInTheDocument();
    expect(screen.getByText('no-playlist')).toBeInTheDocument();
  });

  // Bug QC: bridge từng fetch `GET /stores` rồi mở một socket cho MỌI quán, tất
  // cả đổ vào một thẻ audio dùng chung — store admin đổi bài ở quán mình làm tab
  // org admin nhảy theo.
  it('không mở socket nào ở các trang dashboard không phải chi tiết quán', async () => {
    mockPathname = '/dashboard';
    render(<StoresSyncBridge />);

    await waitFor(() => expect(measureOffset).toHaveBeenCalled());
    expect(mockSockets).toHaveLength(0);
    expect(mockApiGet).not.toHaveBeenCalledWith('/stores');
  });

  it('mở đúng một socket, cho đúng quán đang mở', async () => {
    mockPathname = '/dashboard/stores/store-1';
    mockApiGet.mockResolvedValue(nowPlayingSnapshot('store-1', 'playlist-A'));

    render(
      <>
        <StoresSyncBridge />
        <ReadStoreSync storeId="store-1" />
      </>,
    );

    await waitFor(() => expect(mockSockets).toHaveLength(1));

    await act(async () => {
      mockSockets[0].listeners['connect']?.();
    });

    expect(mockSockets[0].emit).toHaveBeenCalledWith('join-store', { storeId: 'store-1' });
    expect(mockSockets[0].emit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('playlist:playlist-A')).toBeInTheDocument());
  });

  it('bỏ qua event của quán khác lọt vào socket của quán đang mở', async () => {
    mockPathname = '/dashboard/stores/store-1';
    mockApiGet.mockResolvedValue(null);

    render(
      <>
        <StoresSyncBridge />
        <ReadStoreSync storeId="store-1" />
        <ReadStoreSync storeId="store-2" />
      </>,
    );

    await waitFor(() => expect(mockSockets).toHaveLength(1));
    await act(async () => {
      mockSockets[0].listeners['connect']?.();
    });

    await act(async () => {
      mockSockets[0].listeners['store-now-playing']?.(nowPlayingPayload('store-2', 3));
    });

    expect(playTrack).not.toHaveBeenCalled();
    expect(screen.queryByText('remaining:3')).not.toBeInTheDocument();

    // Event của đúng quán thì vẫn chạy bình thường.
    await act(async () => {
      mockSockets[0].listeners['store-now-playing']?.(nowPlayingPayload('store-1', 1));
    });

    expect(playTrack).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('remaining:1')).toBeInTheDocument());
  });

  it('không dừng nhạc khi quán khác báo tạm dừng hoặc dừng hẳn', async () => {
    mockPathname = '/dashboard/stores/store-1';
    mockApiGet.mockResolvedValue(null);

    render(<StoresSyncBridge />);
    await waitFor(() => expect(mockSockets).toHaveLength(1));
    await act(async () => {
      mockSockets[0].listeners['connect']?.();
    });

    await act(async () => {
      mockSockets[0].listeners['store-paused']?.({ storeId: 'store-2', serverTs: Date.now() });
      mockSockets[0].listeners['store-stopped']?.({ storeId: 'store-2', serverTs: Date.now() });
    });

    expect(pauseStore).not.toHaveBeenCalled();
    expect(stopStore).not.toHaveBeenCalled();

    await act(async () => {
      mockSockets[0].listeners['store-paused']?.({ storeId: 'store-1', serverTs: Date.now() });
    });
    expect(pauseStore).toHaveBeenCalledWith('store-1');
  });

  it('đổi sang quán khác thì ngắt socket cũ và dừng nhạc của quán cũ', async () => {
    mockPathname = '/dashboard/stores/store-1';
    mockApiGet.mockResolvedValue(null);

    const { rerender } = render(<StoresSyncBridge />);
    await waitFor(() => expect(mockSockets).toHaveLength(1));

    mockPathname = '/dashboard/stores/store-2';
    await act(async () => {
      rerender(<StoresSyncBridge />);
    });

    await waitFor(() => expect(mockSockets).toHaveLength(2));
    expect(mockSockets[0].disconnect).toHaveBeenCalled();
    expect(stopStore).toHaveBeenCalledWith('store-1');
  });
});
