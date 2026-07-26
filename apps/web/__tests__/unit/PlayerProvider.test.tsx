import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import userEvent from '@testing-library/user-event';
import {
  PlayerProvider,
  usePlayer,
  usePlayerPosition,
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
    this.emit('play');
  });

  pause = jest.fn(() => {
    this.paused = true;
    this.emit('pause');
  });

  emit(event: string) {
    (this.listeners[event] ?? []).forEach((handler) => handler());
  }
}

Object.defineProperty(global, 'Audio', { writable: true, value: MockAudio });

// PlayerProvider tự chạy vòng lặp rAF khi audio 'play' — giả lập
// requestAnimationFrame để tự tay bắn từng khung hình một, không phụ thuộc
// timer thật (tránh flaky/act warning sau khi test kết thúc).
let pendingFrame: FrameRequestCallback | null = null;
Object.defineProperty(global.window, 'requestAnimationFrame', {
  writable: true,
  value: (callback: FrameRequestCallback) => {
    pendingFrame = callback;
    return 1;
  },
});
Object.defineProperty(global.window, 'cancelAnimationFrame', {
  writable: true,
  value: () => {
    pendingFrame = null;
  },
});
const flushFrame = () => {
  const callback = pendingFrame;
  pendingFrame = null;
  callback?.(0);
};

function Harness({
  mode = 'store',
  storeId = 'store-1',
  startPositionMs = 0,
}: {
  mode?: PlayerMode;
  storeId?: string | null;
  startPositionMs?: number;
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
            {
              mode,
              storeId,
              positionMs: startPositionMs,
              queue: { index: 0, total: 3, remaining: 2 },
            },
          )
        }
      >
        start
      </button>
      <button
        onClick={() =>
          player.playTrack(
            {
              id: 'track-1',
              title: 'Hẹn Em Ở Lần Yêu Thứ 2',
              artist: 'Nguyenn',
              // Rejoin luôn presign lại nên URL đổi dù cùng bài
              url: 'https://s3/1-rejoin.mp3',
            },
            { mode, storeId, positionMs: 50_000 },
          )
        }
      >
        rejoin-same-track
      </button>
      <button onClick={() => player.toggle()}>toggle</button>
      <span data-testid="title">{player.current?.title ?? 'idle'}</span>
      <span data-testid="playing">{String(player.isPlaying)}</span>
      <span data-testid="remaining">{player.queue?.remaining ?? -1}</span>
    </div>
  );
}

function PositionConsumer() {
  const positionMs = usePlayerPosition();
  return <span data-testid="position">{positionMs}</span>;
}

const renderHarness = (props: Parameters<typeof Harness>[0] = {}) =>
  render(
    <PlayerProvider>
      <Harness {...props} />
      <PositionConsumer />
    </PlayerProvider>,
  );

describe('PlayerProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockAudio.instances = [];
    pendingFrame = null;
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

  // Chuyển bài do server hẹn giờ và broadcast — client tự gọi /next thì quán
  // mở hai màn hình sẽ bắn hai lệnh và nhạc nhảy cóc.
  it('never asks the server for the next track when a store track ends', async () => {
    mockApi.post.mockResolvedValue({});
    renderHarness();
    await userEvent.click(screen.getByText('start'));

    await act(async () => {
      currentAudio().emit('ended');
    });

    expect(mockApi.post).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('false'));
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

  // Server presign lại URL mỗi lần broadcast nên URL đổi dù cùng bài — reload
  // từ đầu làm mất buffer và trễ đúng bằng thời gian tải lại.
  it('does not reload the audio element on the same track, only reseeks', async () => {
    renderHarness({ mode: 'store', startPositionMs: 10_000 });
    await userEvent.click(screen.getByText('start'));
    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('true'));

    const audio = currentAudio();
    const originalSrc = audio.src;

    await userEvent.click(screen.getByText('rejoin-same-track'));

    expect(audio.src).toBe(originalSrc);
    expect(audio.currentTime).toBe(50);
  });

  // Quán bấm dừng (toggle client-side, không qua server) rồi bấm phát lại phải
  // nhảy bắt kịp giây hiện tại của quán — không tiếp tục từ chỗ đã dừng.
  it('catches up to the live store position when resuming after a local pause', async () => {
    let now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    renderHarness({ mode: 'store', startPositionMs: 10_000 });
    await userEvent.click(screen.getByText('start'));
    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('true'));

    await userEvent.click(screen.getByText('toggle')); // pause
    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('false'));

    now += 5_000; // nhóm trôi thêm 5s trong lúc quán tạm dừng

    await userEvent.click(screen.getByText('toggle')); // resume
    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('true'));

    expect(currentAudio().currentTime).toBe(15);

    jest.restoreAllMocks();
  });

  // Trước đây `timeupdate` gọi setPositionMs trong context ổn định nên MỌI
  // consumer của usePlayer() re-render vài lần mỗi giây, kể cả những nơi chỉ
  // đọc current/isPlaying/queue (bảng track, nút play,...). Vị trí phát giờ
  // chỉ lộ qua usePlayerPosition() (useSyncExternalStore riêng) — context ổn
  // định không còn thay đổi theo nhịp nhạc.
  it('does not re-render consumers that only read usePlayer() on every timeupdate', async () => {
    let renderCount = 0;

    function CountingConsumer() {
      renderCount += 1;
      const { current } = usePlayer();
      return <span data-testid="consumer-current">{current?.title ?? 'idle'}</span>;
    }

    render(
      <PlayerProvider>
        <Harness />
        <CountingConsumer />
      </PlayerProvider>,
    );

    await userEvent.click(screen.getByText('start'));
    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('true'));

    const renderCountAfterPlay = renderCount;

    await act(async () => {
      for (let i = 0; i < 20; i += 1) {
        // currentTime phải đổi giá trị thật mỗi lần — nếu không thay đổi thì
        // React tự bail-out state update giống giá trị cũ, che mất bug.
        currentAudio().currentTime = i + 1;
        currentAudio().emit('timeupdate');
      }
    });

    expect(renderCount).toBe(renderCountAfterPlay);
  });

  // usePlayerPosition() dùng useSyncExternalStore — mỗi lần store đổi giá trị
  // là một lần re-render PlayerBar/màn kiosk (2 nơi duy nhất gọi hook này).
  // Nếu rAF ghi mỗi khung hình (~60 lần/giây) thì 2 nơi đó lại bị re-render
  // nhiều hơn hẳn so với hồi còn dùng `timeupdate` (~4 lần/giây) — ngược lại
  // mục tiêu hết lag của chính đợt refactor này. `positionStore.tick()` phải
  // tiết lưu xuống ~4 lần/giây (POSITION_TICK_INTERVAL_MS = 250ms).
  it('throttles rAF position updates to roughly 4 times per second', async () => {
    let now = 2_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    renderHarness({ mode: 'store', startPositionMs: 0 });
    await userEvent.click(screen.getByText('start'));
    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('true'));

    expect(screen.getByTestId('position')).toHaveTextContent('0');

    // Nhiều khung hình liên tiếp trong cùng khoảng < 250ms: dù currentTime đổi
    // thật mỗi lần, store vẫn phải giữ nguyên giá trị cũ.
    now += 50;
    currentAudio().currentTime = 0.1;
    await act(async () => flushFrame());
    expect(screen.getByTestId('position')).toHaveTextContent('0');

    now += 100;
    currentAudio().currentTime = 0.2;
    await act(async () => flushFrame());
    expect(screen.getByTestId('position')).toHaveTextContent('0');

    now += 90; // tổng cộng mới 240ms từ lần ghi gần nhất — vẫn dưới ngưỡng
    currentAudio().currentTime = 0.3;
    await act(async () => flushFrame());
    expect(screen.getByTestId('position')).toHaveTextContent('0');

    // Vượt ngưỡng 250ms kể từ lần ghi gần nhất — lần này phải cập nhật.
    now += 20; // tổng 260ms
    currentAudio().currentTime = 0.4;
    await act(async () => flushFrame());
    expect(screen.getByTestId('position')).toHaveTextContent('400');

    jest.restoreAllMocks();
  });
});
