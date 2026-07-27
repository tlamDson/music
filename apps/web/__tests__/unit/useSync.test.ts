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
const setPlaybackMode = jest.fn();
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
    mockUsePlayer.mockReturnValue({ playTrack, pause, stop, setPlaybackMode });
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
      listeners['store-now-playing']?.({
        storeId: 'store-1',
        trackId: 'track-1',
        track: { id: 'track-1', title: 'Cà phê sáng', artist: 'Vũ', durationMs: 180_000 },
        trackUrl: 'https://s3/song.mp3',
        positionMs: 0,
        serverTs: Date.now(),
        queue: { index: 0, total: 2, remaining: 1 },
      });
      await Promise.resolve();
    });

    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1', title: 'Cà phê sáng', url: 'https://s3/song.mp3' }),
      expect.objectContaining({ mode: 'store', storeId: 'store-1' }),
    );
  });

  it('should join the store room after connect', async () => {
    const listeners = connectWith();

    await act(async () => {
      listeners['connect']?.();
      await Promise.resolve();
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('join-store', { storeId: 'store-1' });
  });

  it('should not open a socket without a store', () => {
    const { io } = require('socket.io-client') as { io: jest.Mock };
    io.mockClear();

    renderHook(() => useSync({ token: 'test-token' }));

    expect(io).not.toHaveBeenCalled();
  });

  // Broadcast không replay khi join room — trang mở sau lúc admin bấm phát phải
  // tự hỏi "đang phát gì" chứ không ngồi đợi bài kế.
  it('hydrates the player from the now-playing snapshot on connect', async () => {
    mockApiGet.mockResolvedValue({
      storeId: 'store-1',
      track: { id: 'track-7', title: 'Hạ trắng', artist: null, durationMs: 240_000 },
      trackUrl: 'https://s3/ha-trang.mp3',
      positionMs: 34_000,
      serverTs: Date.now(),
      isPlaying: true,
      queue: { index: 1, total: 3, remaining: 1 },
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
      expect.objectContaining({ mode: 'store', positionMs: expect.any(Number) }),
    );
  });

  it('pauses the player when a store-paused event arrives', async () => {
    const listeners = connectWith();

    await act(async () => {
      listeners['store-paused']?.({ storeId: 'store-1', serverTs: Date.now() });
    });

    expect(pause).toHaveBeenCalled();
  });

  it('stops the player when a store-stopped event arrives', async () => {
    const listeners = connectWith();

    await act(async () => {
      listeners['store-stopped']?.({ storeId: 'store-1', serverTs: Date.now() });
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

  // PR #58: backend giờ gửi kèm repeat/shuffle trong `store-now-playing` —
  // client dựng nút repeat/shuffle từ đây, không tự đoán/giữ state cục bộ.
  it('exposes repeat and shuffle from the store-now-playing payload', async () => {
    const listeners = connectWith();

    await act(async () => {
      listeners['store-now-playing']?.({
        storeId: 'store-1',
        trackId: 'track-1',
        track: { id: 'track-1', title: 'Cà phê sáng', artist: 'Vũ', durationMs: 180_000 },
        trackUrl: 'https://s3/song.mp3',
        positionMs: 0,
        serverTs: Date.now(),
        queue: { index: 0, total: 2, remaining: 1 },
        repeat: 'ALL',
        shuffle: true,
      });
      await Promise.resolve();
    });

    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1' }),
      expect.objectContaining({ repeat: 'ALL', shuffle: true }),
    );
  });

  // Đổi repeat/shuffle không làm gián đoạn nhạc đang phát — broadcast riêng
  // `store-mode-changed` thay vì gửi lại toàn bộ `store-now-playing`.
  it('forwards store-mode-changed into the player without restarting playback', async () => {
    const listeners = connectWith();

    await act(async () => {
      listeners['store-mode-changed']?.({ storeId: 'store-1', repeat: 'ONE', shuffle: true });
    });

    expect(setPlaybackMode).toHaveBeenCalledWith({ repeat: 'ONE', shuffle: true });
    expect(playTrack).not.toHaveBeenCalled();
  });

  // playlistId chỉ có trong snapshot hydrate (không có trong broadcast live) —
  // dùng để hiển thị "đang phát playlist nào" ngay khi mở trang giữa chừng.
  it('picks up playlistId from the now-playing snapshot on hydrate', async () => {
    mockApiGet.mockResolvedValue({
      storeId: 'store-1',
      playlistId: 'playlist-42',
      track: { id: 'track-7', title: 'Hạ trắng', artist: null, durationMs: 240_000 },
      trackUrl: 'https://s3/ha-trang.mp3',
      positionMs: 34_000,
      serverTs: Date.now(),
      isPlaying: true,
      queue: { index: 1, total: 3, remaining: 1 },
      repeat: 'OFF',
      shuffle: false,
    });

    const listeners: Record<string, (...args: unknown[]) => void> = {};
    mockSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb;
    });
    const { result } = renderHook(() => useSync({ storeId: 'store-1', token: 'test-token' }));

    await act(async () => {
      listeners['connect']?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.playlistId).toBe('playlist-42');
  });

  // Quán dừng hẳn thì mọi trạng thái mode phải reset — quán bắt đầu phát bài
  // mới sau đó không được kế thừa nhầm repeat/shuffle của lượt phát trước.
  it('resets playlistId, repeat and shuffle when the store stops', async () => {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    mockSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb;
    });
    const { result } = renderHook(() => useSync({ storeId: 'store-1', token: 'test-token' }));

    await act(async () => {
      listeners['store-now-playing']?.({
        storeId: 'store-1',
        trackId: 'track-1',
        track: { id: 'track-1', title: 'Cà phê sáng', artist: 'Vũ', durationMs: 180_000 },
        trackUrl: 'https://s3/song.mp3',
        positionMs: 0,
        serverTs: Date.now(),
        queue: { index: 0, total: 2, remaining: 1 },
        repeat: 'ALL',
        shuffle: true,
      });
    });
    expect(result.current.repeat).toBe('ALL');
    expect(result.current.shuffle).toBe(true);

    await act(async () => {
      listeners['store-stopped']?.({ storeId: 'store-1', serverTs: Date.now() });
    });

    expect(result.current.storeQueue).toBeNull();
    expect(result.current.playlistId).toBeNull();
    expect(result.current.repeat).toBe('OFF');
    expect(result.current.shuffle).toBe(false);
  });
});
