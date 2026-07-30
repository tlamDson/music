import { render, screen, act, waitFor } from '@testing-library/react';
import StoreSyncProvider, { useStoreSync } from '../../src/components/sync/StoreSyncProvider';
import { usePlayer } from '../../src/components/player/PlayerProvider';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
const mockApiGet = api.get as jest.Mock;

// useSync đẩy nhạc vào PlayerProvider — mock provider để test tập trung vào
// chuyện "event WS có tới được player hay không".
const playTrack = jest.fn();
const pauseStore = jest.fn();
const stopStore = jest.fn();
const setPlaybackMode = jest.fn();
jest.mock('../../src/components/player/PlayerProvider', () => ({
  usePlayer: jest.fn(),
}));
const mockUsePlayer = usePlayer as jest.Mock;

const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  connected: true,
};
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}));

// Giữ `measureOffset` ổn định giữa các lần render để effect không chạy vòng lặp.
const measureOffset = jest.fn(async () => {});
jest.mock('../../src/hooks/useClockOffset', () => ({
  useClockOffset: () => ({ offset: 0, measureOffset }),
}));

/** Một trang con bất kỳ trong `/store` — cố tình KHÔNG phải `StoreHome`, vì
 * đúng chỗ này là nơi bug xảy ra: `/store/playlists/[id]` không tự mở socket. */
function SomeStorePage() {
  const { isConnected, storeQueue, playlistId, repeat, shuffle } = useStoreSync();
  return (
    <div>
      <span>{isConnected ? 'connected' : 'offline'}</span>
      <span>{storeQueue ? `remaining:${storeQueue.remaining}` : 'no-queue'}</span>
      <span>{playlistId ? `playlist:${playlistId}` : 'no-playlist'}</span>
      <span>{`repeat:${repeat}`}</span>
      <span>{`shuffle:${shuffle}`}</span>
    </div>
  );
}

function captureListeners(): Record<string, (...args: unknown[]) => void> {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  mockSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    listeners[event] = cb;
  });
  return listeners;
}

const nowPlayingPayload = {
  storeId: 'store-1',
  trackId: 'track-1',
  track: { id: 'track-1', title: 'LoveMeNot', artist: null, durationMs: 218_000 },
  trackUrl: 'https://s3.local/lovemenot.mp3',
  positionMs: 0,
  serverTs: Date.now(),
  queue: { index: 0, total: 2, remaining: 1 },
  repeat: 'OFF' as const,
  shuffle: false,
};

describe('StoreSyncProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.on.mockImplementation(jest.fn());
    mockUsePlayer.mockReturnValue({ playTrack, pauseStore, stopStore, setPlaybackMode });
    mockApiGet.mockResolvedValue({ storeId: 'store-1', syncGroupId: null });
    localStorage.setItem('accessToken', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('đẩy nhạc vào player khi trang con không phải StoreHome nhận store-now-playing', async () => {
    const listeners = captureListeners();

    render(
      <StoreSyncProvider storeId="store-1">
        <SomeStorePage />
      </StoreSyncProvider>,
    );

    await act(async () => {
      listeners['connect']?.();
    });
    await act(async () => {
      listeners['store-now-playing']?.(nowPlayingPayload);
    });

    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1', title: 'LoveMeNot' }),
      expect.objectContaining({ mode: 'store', storeId: 'store-1' }),
    );
  });

  it('join room của quán ngay khi socket connect', async () => {
    const listeners = captureListeners();

    render(
      <StoreSyncProvider storeId="store-1">
        <SomeStorePage />
      </StoreSyncProvider>,
    );

    await act(async () => {
      listeners['connect']?.();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('join-store', { storeId: 'store-1' });
  });

  it('chia sẻ trạng thái kết nối và hàng chờ qua context', async () => {
    const listeners = captureListeners();

    render(
      <StoreSyncProvider storeId="store-1">
        <SomeStorePage />
      </StoreSyncProvider>,
    );

    expect(screen.getByText('offline')).toBeInTheDocument();

    await act(async () => {
      listeners['connect']?.();
    });
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());

    await act(async () => {
      listeners['store-now-playing']?.(nowPlayingPayload);
    });
    await waitFor(() => expect(screen.getByText('remaining:1')).toBeInTheDocument());
  });

  it('không mở socket khi tài khoản chưa gắn quán nào', () => {
    const { io } = require('socket.io-client') as { io: jest.Mock };

    render(
      <StoreSyncProvider storeId={null}>
        <SomeStorePage />
      </StoreSyncProvider>,
    );

    expect(io).not.toHaveBeenCalled();
    expect(screen.getByText('offline')).toBeInTheDocument();
  });

  it('chỉ mở đúng một socket cho cả subtree dù có nhiều trang con', async () => {
    const { io } = require('socket.io-client') as { io: jest.Mock };
    captureListeners();

    render(
      <StoreSyncProvider storeId="store-1">
        <SomeStorePage />
        <SomeStorePage />
      </StoreSyncProvider>,
    );

    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
  });

  // PR #58: repeat/shuffle/playlistId giờ cũng phải chảy qua context của
  // provider này, không chỉ storeQueue — trang con nào cũng đọc được cùng một
  // nguồn thay vì tự gọi useSync() lần nữa (hai socket cùng lúc là bug cũ).
  it('chia sẻ playlistId, repeat và shuffle qua context theo store-now-playing', async () => {
    const listeners = captureListeners();

    render(
      <StoreSyncProvider storeId="store-1">
        <SomeStorePage />
      </StoreSyncProvider>,
    );

    expect(screen.getByText('repeat:OFF')).toBeInTheDocument();
    expect(screen.getByText('shuffle:false')).toBeInTheDocument();

    await act(async () => {
      listeners['store-now-playing']?.({ ...nowPlayingPayload, repeat: 'ALL', shuffle: true });
    });

    await waitFor(() => expect(screen.getByText('repeat:ALL')).toBeInTheDocument());
    expect(screen.getByText('shuffle:true')).toBeInTheDocument();
  });

  // Đổi mode không đi kèm track mới — context vẫn phải cập nhật ngay từ
  // broadcast `store-mode-changed` riêng.
  it('cập nhật repeat/shuffle qua context khi nhận store-mode-changed', async () => {
    const listeners = captureListeners();

    render(
      <StoreSyncProvider storeId="store-1">
        <SomeStorePage />
      </StoreSyncProvider>,
    );

    await act(async () => {
      listeners['store-mode-changed']?.({ storeId: 'store-1', repeat: 'ONE', shuffle: true });
    });

    await waitFor(() => expect(screen.getByText('repeat:ONE')).toBeInTheDocument());
    expect(screen.getByText('shuffle:true')).toBeInTheDocument();
    expect(setPlaybackMode).toHaveBeenCalledWith({ repeat: 'ONE', shuffle: true });
  });
});
