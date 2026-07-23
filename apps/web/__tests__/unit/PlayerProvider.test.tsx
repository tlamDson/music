import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import {
  PlayerProvider,
  usePlayer,
  type PlayerMode,
} from '../../src/components/player/PlayerProvider';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

// jsdom không có audio thật: giả lập vừa đủ để kiểm tra luồng điều khiển
class MockAudio {
  static instances: MockAudio[] = [];
  src = '';
  currentTime = 0;
  duration = 180;
  volume = 1;
  paused = true;
  private listeners: Record<string, Array<() => void>> = {};

  constructor() {
    MockAudio.instances.push(this);
  }

  addEventListener(event: string, handler: () => void) {
    (this.listeners[event] ||= []).push(handler);
  }

  removeEventListener(event: string, handler: () => void) {
    this.listeners[event] = (this.listeners[event] ?? []).filter((h) => h !== handler);
  }

  play = jest.fn(async () => {
    this.paused = false;
  });

  pause = jest.fn(() => {
    this.paused = true;
  });

  emit(event: string) {
    (this.listeners[event] ?? []).forEach((handler) => handler());
  }
}

Object.defineProperty(global, 'Audio', { writable: true, value: MockAudio });

function Harness({
  mode = 'local',
  storeId = 'store-1',
}: {
  mode?: PlayerMode;
  storeId?: string | null;
}) {
  const player = usePlayer();

  return (
    <div>
      <button
        onClick={() =>
          player.playTrack(
            {
              id: 'track-1',
              title: 'Hẹn Em Ở Lần Yêu Thứ 2',
              artist: 'Nguyenn',
              url: 'https://s3/1.mp3',
            },
            { mode, storeId, queue: { index: 0, total: 3, remaining: 2 } },
          )
        }
      >
        start
      </button>
      <span data-testid="title">{player.current?.title ?? 'idle'}</span>
      <span data-testid="playing">{String(player.isPlaying)}</span>
      <span data-testid="remaining">{player.queue?.remaining ?? -1}</span>
    </div>
  );
}

const renderHarness = (props: Parameters<typeof Harness>[0] = {}) =>
  render(
    <PlayerProvider>
      <Harness {...props} />
    </PlayerProvider>,
  );

describe('PlayerProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockAudio.instances = [];
  });

  const currentAudio = () => MockAudio.instances[MockAudio.instances.length - 1];

  it('loads and plays the requested track', async () => {
    renderHarness();

    await userEvent.click(screen.getByText('start'));

    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('true'));
    expect(currentAudio().src).toBe('https://s3/1.mp3');
    expect(currentAudio().play).toHaveBeenCalled();
    expect(screen.getByTestId('title')).toHaveTextContent('Hẹn Em Ở Lần Yêu Thứ 2');
  });

  it('exposes how many tracks are left in the store queue', async () => {
    renderHarness();

    await userEvent.click(screen.getByText('start'));

    await waitFor(() => expect(screen.getByTestId('remaining')).toHaveTextContent('2'));
  });

  // Server là nơi quyết định bài kế hay quay lại nhóm sync, client chỉ báo "hết bài"
  it('asks the server for the next track when a store queue track ends', async () => {
    mockApi.post.mockResolvedValue({});
    renderHarness();
    await userEvent.click(screen.getByText('start'));

    await act(async () => {
      currentAudio().emit('ended');
    });

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/next'));
  });

  it('does not touch the server when a preview ends', async () => {
    renderHarness({ mode: 'preview', storeId: null });
    await userEvent.click(screen.getByText('start'));

    await act(async () => {
      currentAudio().emit('ended');
    });

    expect(mockApi.post).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('false'));
  });

  it('does not drive the queue while following the sync group', async () => {
    renderHarness({ mode: 'group', storeId: 'store-1' });
    await userEvent.click(screen.getByText('start'));

    await act(async () => {
      currentAudio().emit('ended');
    });

    expect(mockApi.post).not.toHaveBeenCalled();
  });
});
