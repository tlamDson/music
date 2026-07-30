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
  loop = false;
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
  startRepeat,
  startShuffle,
}: {
  mode?: PlayerMode;
  storeId?: string | null;
  startPositionMs?: number;
  startRepeat?: 'OFF' | 'ALL' | 'ONE';
  startShuffle?: boolean;
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
              repeat: startRepeat,
              shuffle: startShuffle,
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
      <button onClick={() => player.stop()}>stop</button>
      <button onClick={() => player.pauseStore('store-1')}>pause-store-1</button>
      <button onClick={() => player.pauseStore('store-2')}>pause-store-2</button>
      <button onClick={() => player.stopStore('store-1')}>stop-store-1</button>
      <button onClick={() => player.stopStore('store-2')}>stop-store-2</button>
      <button onClick={() => player.setPlaybackMode({ repeat: 'ALL', shuffle: true })}>
        confirm-server-mode
      </button>
      <button onClick={() => player.togglePreviewRepeat()}>toggle-preview-repeat</button>
      <span data-testid="title">{player.current?.title ?? 'idle'}</span>
      <span data-testid="playing">{String(player.isPlaying)}</span>
      <span data-testid="remaining">{player.queue?.remaining ?? -1}</span>
      <span data-testid="repeat">{player.repeat}</span>
      <span data-testid="shuffle">{String(player.shuffle)}</span>
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

  // PR player-bar-controls: repeat/shuffle giờ sống trong PlayerProvider để
  // PlayerBar (mount ở root layout, ngoài cây StoreSyncProvider/StoresSyncBridge)
  // vẫn đọc được đúng trạng thái do server xác nhận bất kể route nào.
  it('seeds repeat/shuffle from playTrack options', async () => {
    renderHarness({ mode: 'store', startRepeat: 'ALL', startShuffle: true });

    await userEvent.click(screen.getByText('start'));

    expect(screen.getByTestId('repeat')).toHaveTextContent('ALL');
    expect(screen.getByTestId('shuffle')).toHaveTextContent('true');
  });

  it('defaults repeat to OFF and shuffle to false when not provided', async () => {
    renderHarness({ mode: 'store' });

    await userEvent.click(screen.getByText('start'));

    expect(screen.getByTestId('repeat')).toHaveTextContent('OFF');
    expect(screen.getByTestId('shuffle')).toHaveTextContent('false');
  });

  // `setPlaybackMode` là điểm useSync gọi vào sau broadcast `store-mode-changed`
  // — chỉ cập nhật hiển thị, không được đụng vào thẻ audio đang chạy (không
  // restart, không seek).
  it('updates repeat/shuffle via setPlaybackMode without touching the audio element', async () => {
    renderHarness({ mode: 'store' });
    await userEvent.click(screen.getByText('start'));
    await waitFor(() => expect(screen.getByTestId('playing')).toHaveTextContent('true'));

    const audio = currentAudio();
    const playCallsBefore = audio.play.mock.calls.length;

    await userEvent.click(screen.getByText('confirm-server-mode'));

    expect(screen.getByTestId('repeat')).toHaveTextContent('ALL');
    expect(screen.getByTestId('shuffle')).toHaveTextContent('true');
    expect(audio.play.mock.calls.length).toBe(playCallsBefore);
  });

  // Nghe thử không có gì trên server để đồng bộ — lặp một bài chạy hẳn bằng
  // `audio.loop`, đổi cục bộ ngay khi bấm, không qua setPlaybackMode/API.
  it('toggles preview repeat locally between OFF and ONE via audio.loop', async () => {
    renderHarness({ mode: 'preview', storeId: null });
    await userEvent.click(screen.getByText('start'));

    expect(screen.getByTestId('repeat')).toHaveTextContent('OFF');
    expect(currentAudio().loop).toBe(false);

    await userEvent.click(screen.getByText('toggle-preview-repeat'));
    expect(screen.getByTestId('repeat')).toHaveTextContent('ONE');
    expect(currentAudio().loop).toBe(true);

    await userEvent.click(screen.getByText('toggle-preview-repeat'));
    expect(screen.getByTestId('repeat')).toHaveTextContent('OFF');
    expect(currentAudio().loop).toBe(false);
  });

  // Quán tự chuyển bài bằng timer theo `durationMs`, không phải thuộc tính
  // `loop` gốc của audio — bật `loop` ở chế độ store sẽ đá văng đồng bộ.
  it('does not toggle preview repeat while in store mode', async () => {
    renderHarness({ mode: 'store' });
    await userEvent.click(screen.getByText('start'));

    await userEvent.click(screen.getByText('toggle-preview-repeat'));

    expect(screen.getByTestId('repeat')).toHaveTextContent('OFF');
    expect(currentAudio().loop).toBe(false);
  });

  // Bug QC: `pause`/`stop` trần không biết lệnh đến từ quán nào. Một tab giữ
  // socket của nhiều quán thì quán B tạm dừng/dừng hẳn cũng tắt được nhạc quán A
  // đang phát. Hai hàm scoped này phải tự no-op khi không đúng quán đang sở hữu
  // thẻ audio.
  describe('pauseStore / stopStore theo phạm vi quán', () => {
    it('bỏ qua lệnh tạm dừng của quán khác', async () => {
      renderHarness({ mode: 'store', storeId: 'store-1' });
      await userEvent.click(screen.getByText('start'));
      expect(screen.getByTestId('playing')).toHaveTextContent('true');

      await userEvent.click(screen.getByText('pause-store-2'));

      expect(screen.getByTestId('playing')).toHaveTextContent('true');
      expect(currentAudio().paused).toBe(false);
    });

    it('tạm dừng khi đúng quán đang phát', async () => {
      renderHarness({ mode: 'store', storeId: 'store-1' });
      await userEvent.click(screen.getByText('start'));

      await userEvent.click(screen.getByText('pause-store-1'));

      expect(screen.getByTestId('playing')).toHaveTextContent('false');
      expect(currentAudio().paused).toBe(true);
    });

    it('bỏ qua lệnh dừng hẳn của quán khác', async () => {
      renderHarness({ mode: 'store', storeId: 'store-1' });
      await userEvent.click(screen.getByText('start'));

      await userEvent.click(screen.getByText('stop-store-2'));

      expect(screen.getByTestId('title')).not.toHaveTextContent('idle');
    });

    it('dừng hẳn khi đúng quán đang phát', async () => {
      renderHarness({ mode: 'store', storeId: 'store-1' });
      await userEvent.click(screen.getByText('start'));

      await userEvent.click(screen.getByText('stop-store-1'));

      expect(screen.getByTestId('title')).toHaveTextContent('idle');
    });

    // Nghe thử (`mode: 'preview'`) không thuộc quán nào — lệnh WS của bất kỳ quán
    // cũng không được cắt ngang bài đang nghe thử tại chỗ.
    it('không đụng vào nhạc đang nghe thử', async () => {
      renderHarness({ mode: 'preview', storeId: null });
      await userEvent.click(screen.getByText('start'));

      await userEvent.click(screen.getByText('stop-store-1'));

      expect(screen.getByTestId('title')).not.toHaveTextContent('idle');
    });
  });

  it('resets repeat/shuffle and audio.loop on stop', async () => {
    renderHarness({ mode: 'store', startRepeat: 'ONE', startShuffle: true });
    await userEvent.click(screen.getByText('start'));
    expect(screen.getByTestId('repeat')).toHaveTextContent('ONE');
    expect(screen.getByTestId('shuffle')).toHaveTextContent('true');

    await userEvent.click(screen.getByText('stop'));

    expect(screen.getByTestId('repeat')).toHaveTextContent('OFF');
    expect(screen.getByTestId('shuffle')).toHaveTextContent('false');
    expect(currentAudio().loop).toBe(false);
  });
});
