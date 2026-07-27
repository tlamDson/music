import { render, screen, act, waitFor } from '@testing-library/react';
import StoresSyncBridge, { useStoresSync } from '../../src/components/sync/StoresSyncBridge';
import { usePlayer } from '../../src/components/player/PlayerProvider';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
const mockApiGet = api.get as jest.Mock;

const playTrack = jest.fn();
const pause = jest.fn();
const stop = jest.fn();
const setPlaybackMode = jest.fn();
jest.mock('../../src/components/player/PlayerProvider', () => ({
  usePlayer: jest.fn(),
}));
const mockUsePlayer = usePlayer as jest.Mock;

// Một socket giả cho mỗi lần `io(...)` được gọi — mỗi quán có socket riêng,
// giữ trong danh sách theo thứ tự tạo để test lấy ra đúng listener của quán nào.
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

describe('StoresSyncBridge / useStoresSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSockets.length = 0;
    mockUsePlayer.mockReturnValue({ playTrack, pause, stop, setPlaybackMode });
    localStorage.setItem('accessToken', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('trả về trạng thái mặc định khi quán chưa có socket nào báo cáo', () => {
    mockApiGet.mockResolvedValue({ data: [] });
    render(<ReadStoreSync storeId="store-1" />);

    expect(screen.getByText('offline')).toBeInTheDocument();
    expect(screen.getByText('no-queue')).toBeInTheDocument();
    expect(screen.getByText('no-playlist')).toBeInTheDocument();
  });

  it('cập nhật trạng thái đúng quán khi bridge mở nhiều socket cùng lúc', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === '/stores') {
        return Promise.resolve({ data: [{ id: 'store-1' }, { id: 'store-2' }] });
      }
      return Promise.resolve(null);
    });

    render(
      <>
        <StoresSyncBridge />
        <ReadStoreSync storeId="store-1" />
        <ReadStoreSync storeId="store-2" />
      </>,
    );

    await waitFor(() => expect(mockSockets).toHaveLength(2));

    await act(async () => {
      mockSockets[0].listeners['connect']?.();
    });
    await act(async () => {
      mockSockets[0].listeners['store-now-playing']?.(nowPlayingPayload('store-1', 3));
    });

    await waitFor(() => expect(screen.getByText('remaining:3')).toBeInTheDocument());

    // Quán 2 chưa nhận gì — không bị lây trạng thái từ quán 1.
    const store2Section = screen.getAllByText('no-queue');
    expect(store2Section.length).toBeGreaterThan(0);
  });

  it('không lẫn playlistId giữa hai quán khác nhau', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path === '/stores') {
        return Promise.resolve({ data: [{ id: 'store-1' }, { id: 'store-2' }] });
      }
      // now-playing hydrate cho từng quán
      if (path === '/sync/stores/store-1/now-playing') {
        return Promise.resolve({
          storeId: 'store-1',
          playlistId: 'playlist-A',
          track: { id: 'track-1', title: 'A', artist: null, durationMs: 100_000 },
          trackUrl: 'https://s3/a.mp3',
          positionMs: 0,
          serverTs: Date.now(),
          isPlaying: true,
          queue: { index: 0, total: 1, remaining: 0 },
          repeat: 'OFF',
          shuffle: false,
        });
      }
      if (path === '/sync/stores/store-2/now-playing') {
        return Promise.resolve({
          storeId: 'store-2',
          playlistId: 'playlist-B',
          track: { id: 'track-2', title: 'B', artist: null, durationMs: 100_000 },
          trackUrl: 'https://s3/b.mp3',
          positionMs: 0,
          serverTs: Date.now(),
          isPlaying: true,
          queue: { index: 0, total: 1, remaining: 0 },
          repeat: 'OFF',
          shuffle: false,
        });
      }
      return Promise.resolve(null);
    });

    render(
      <>
        <StoresSyncBridge />
        <ReadStoreSync storeId="store-1" />
        <ReadStoreSync storeId="store-2" />
      </>,
    );

    await waitFor(() => expect(mockSockets).toHaveLength(2));

    await act(async () => {
      mockSockets[0].listeners['connect']?.();
    });
    await act(async () => {
      mockSockets[1].listeners['connect']?.();
    });

    await waitFor(() => expect(screen.getByText('playlist:playlist-A')).toBeInTheDocument());
    expect(screen.getByText('playlist:playlist-B')).toBeInTheDocument();
  });
});
