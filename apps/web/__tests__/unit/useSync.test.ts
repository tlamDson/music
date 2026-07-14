import { renderHook, act } from '@testing-library/react';
import { useSync } from '../../src/hooks/useSync';

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

// Mock HTMLAudioElement
const mockAudio = {
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn(),
  src: '',
  currentTime: 0,
};

Object.defineProperty(global, 'Audio', {
  writable: true,
  value: jest.fn(() => mockAudio),
});

describe('useSync hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.on.mockImplementation(jest.fn());
  });

  it('should connect to socket when storeId is provided', () => {
    const { io } = require('socket.io-client') as { io: jest.Mock };

    renderHook(() =>
      useSync({ storeId: 'store-1', token: 'test-token', audioRef: { current: mockAudio as unknown as HTMLAudioElement } }),
    );

    expect(io).toHaveBeenCalledWith(
      expect.stringContaining('/sync'),
      expect.objectContaining({ auth: { token: 'test-token' } }),
    );
  });

  it('should call audio.play() when now-playing event is received', async () => {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    mockSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb;
    });

    renderHook(() =>
      useSync({ storeId: 'store-1', token: 'test-token', audioRef: { current: mockAudio as unknown as HTMLAudioElement } }),
    );

    const nowPlayingPayload = {
      groupId: 'group-1',
      trackId: 'track-1',
      trackUrl: 'https://s3/song.mp3',
      positionMs: 0,
      serverTs: Date.now(),
      mode: 'LOOSE',
    };

    await act(async () => {
      listeners['now-playing']?.(nowPlayingPayload);
      await Promise.resolve();
    });

    expect(mockAudio.play).toHaveBeenCalled();
  });

  it('should pause audio when paused event is received', async () => {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    mockSocket.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb;
    });

    renderHook(() =>
      useSync({ storeId: 'store-1', token: 'test-token', audioRef: { current: mockAudio as unknown as HTMLAudioElement } }),
    );

    await act(async () => {
      listeners['paused']?.({ groupId: 'group-1', serverTs: Date.now() });
    });

    expect(mockAudio.pause).toHaveBeenCalled();
  });
});
