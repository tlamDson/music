import { renderHook, act } from '@testing-library/react';
import { useSync } from '../../src/hooks/useSync';
import { api } from '../../src/lib/api-client';
import { usePlayer } from '../../src/components/player/PlayerProvider';

// Mock api client (dùng để lấy syncGroupId + hydrate now-playing)
jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));
const mockApiGet = api.get as jest.Mock;

// useSync giờ đẩy nhạc vào PlayerProvider thay vì tự lái thẻ audio
const playTrack = jest.fn();
const pause = jest.fn();
const stop = jest.fn();
jest.mock('../../src/components/player/PlayerProvider', () => ({
  usePlayer: jest.fn(),
}));
const mockUsePlayer = usePlayer as jest.Mock;

// Mock socket.io-client
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

function connectWith(
  options: Partial<Parameters<typeof useSync>[0]> = {},
): Record<string, (...args: unknown[]) => void> {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  mockSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    listeners[event] = cb;
  });

  renderHook(() => useSync({ storeId: 'store-1', token: 'test-token', ...options }));
  return listeners;
}

describe('useSync hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.on.mockImplementation(jest.fn());
    mockUsePlayer.mockReturnValue({ playTrack, pause, stop });
    mockApiGet.mockResolvedValue({ storeId: 'store-1', syncGroupId: 'group-1' });
  });

  it('should connect to socket when storeId is provided', () => {
    const { io } = require('socket.io-client') as { io: jest.Mock };

    renderHook(() => useSync({ storeId: 'store-1', token: 'test-token' }));

    expect(io).toHaveBeenCalledWith(
      expect.stringContaining('/sync'),
      expect.objectContaining({ auth: { token: 'test-token' } }),
    );
  });

  it('should push the now-playing track into the player with its title', async () => {
    const listeners = connectWith();

    await act(async () => {
      listeners['now-playing']?.({
        groupId: 'group-1',
        trackId: 'track-1',
        track: { id: 'track-1', title: 'Cà phê sáng', artist: 'Vũ', durationMs: 180_000 },
        trackUrl: 'https://s3/song.mp3',
        positionMs: 0,
        serverTs: Date.now(),
        mode: 'LOOSE',
      });
      await Promise.resolve();
    });

    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1', title: 'Cà phê sáng', url: 'https://s3/song.mp3' }),
      expect.objectContaining({ mode: 'group', storeId: 'store-1' }),
    );
  });

  it('should join the sync group room after connect', async () => {
    const listeners = connectWith();

    await act(async () => {
      listeners['connect']?.();
      await Promise.resolve();
    });

    expect(mockApiGet).toHaveBeenCalledWith('/stores/store-1/status');
    expect(mockSocket.emit).toHaveBeenCalledWith('join-group', { groupId: 'group-1' });
  });

  it('should not join any room when store has no sync group', async () => {
    mockApiGet.mockImplementation((path: string) =>
      path.includes('/status')
        ? Promise.resolve({ storeId: 'store-1', syncGroupId: null })
        : Promise.resolve(null),
    );
    const listeners = connectWith();

    await act(async () => {
      listeners['connect']?.();
      await Promise.resolve();
    });

    expect(mockSocket.emit).not.toHaveBeenCalledWith('join-group', expect.anything());
  });

  // Broadcast không replay khi join room — trang mở sau lúc admin bấm phát phải
  // tự hỏi "đang phát gì" chứ không ngồi đợi bài kế.
  it('hydrates the player from the now-playing snapshot on connect', async () => {
    mockApiGet.mockImplementation((path: string) => {
      if (path.includes('/status')) {
        return Promise.resolve({ storeId: 'store-1', syncGroupId: 'group-1' });
      }
      return Promise.resolve({
        source: 'GROUP',
        groupId: 'group-1',
        storeId: 'store-1',
        track: { id: 'track-7', title: 'Hạ trắng', artist: null, durationMs: 240_000 },
        trackUrl: 'https://s3/ha-trang.mp3',
        positionMs: 34_000,
        serverTs: Date.now(),
        isPlaying: true,
        queue: null,
      });
    });
    const listeners = connectWith();

    await act(async () => {
      listeners['connect']?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockApiGet).toHaveBeenCalledWith('/sync/stores/store-1/now-playing');
    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-7', title: 'Hạ trắng' }),
      expect.objectContaining({ mode: 'group', positionMs: expect.any(Number) }),
    );
  });

  it('pauses the player when a paused event arrives', async () => {
    const listeners = connectWith();

    await act(async () => {
      listeners['paused']?.({ groupId: 'group-1', serverTs: Date.now() });
    });

    expect(pause).toHaveBeenCalled();
  });

  it('stops the player when a stopped event arrives', async () => {
    const listeners = connectWith();

    await act(async () => {
      listeners['stopped']?.({ groupId: 'group-1', serverTs: Date.now() });
    });

    expect(stop).toHaveBeenCalled();
  });

  // clockOffset đổi liên tục sau khi đo — không được kéo socket dựng lại, nếu
  // không event rơi vào cửa sổ reconnect là mất.
  it('does not rebuild the socket when the clock offset changes', () => {
    const { io } = require('socket.io-client') as { io: jest.Mock };

    const { rerender } = renderHook(
      ({ clockOffset }) => useSync({ storeId: 'store-1', token: 'test-token', clockOffset }),
      { initialProps: { clockOffset: 0 } },
    );
    rerender({ clockOffset: 120 });
    rerender({ clockOffset: -45 });

    expect(io).toHaveBeenCalledTimes(1);
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });
});
