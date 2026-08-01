import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerProvider, usePlayer } from '../../src/components/player/PlayerProvider';
import PlayerBar from '../../src/components/player/PlayerBar';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
const mockApi = api as jest.Mocked<typeof api>;

let mockPathname = '/store';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

class MockAudio {
  static instances: MockAudio[] = [];
  src = '';
  currentTime = 0;
  duration = 366;
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
  });

  pause = jest.fn(() => {
    this.paused = true;
  });

  emit(event: string) {
    (this.listeners[event] ?? []).forEach((handler) => handler());
  }
}

Object.defineProperty(global, 'Audio', { writable: true, value: MockAudio });

function StartButton() {
  const player = usePlayer();

  return (
    <>
      <button
        onClick={() =>
          player.playTrack(
            {
              id: 'track-1',
              title: 'Hẹn Em Ở Lần Yêu Thứ 2',
              artist: 'Nguyenn, Đặng Tuấn Vũ',
              url: 'https://s3/1.mp3',
              durationMs: 366_000,
            },
            {
              mode: 'store',
              storeId: 'store-1',
              queue: { index: 0, total: 3, remaining: 2 },
              repeat: 'OFF',
              shuffle: false,
            },
          )
        }
      >
        start
      </button>
      {/* Giữa hàng chờ — cả "Bài trước" lẫn "Bài kế tiếp" đều có chỗ để đi. */}
      <button
        onClick={() =>
          player.playTrack(
            {
              id: 'track-2',
              title: 'Bài giữa hàng chờ',
              artist: 'Ai đó',
              url: 'https://s3/2.mp3',
              durationMs: 200_000,
            },
            {
              mode: 'store',
              storeId: 'store-1',
              queue: { index: 1, total: 3, remaining: 1 },
              repeat: 'OFF',
              shuffle: false,
            },
          )
        }
      >
        start-middle-track
      </button>
      {/* Bài cuối hàng chờ — không còn gì để chuyển tiếp. */}
      <button
        onClick={() =>
          player.playTrack(
            {
              id: 'track-3',
              title: 'Bài cuối hàng chờ',
              artist: 'Ai đó',
              url: 'https://s3/3.mp3',
              durationMs: 200_000,
            },
            {
              mode: 'store',
              storeId: 'store-1',
              queue: { index: 2, total: 3, remaining: 0 },
              repeat: 'OFF',
              shuffle: false,
            },
          )
        }
      >
        start-last-track
      </button>
      <button
        onClick={() =>
          player.playTrack(
            {
              id: 'track-preview',
              title: 'Nghe thử',
              artist: 'Ai đó',
              url: 'https://s3/preview.mp3',
              durationMs: 200_000,
            },
            { mode: 'preview', storeId: null },
          )
        }
      >
        start-preview
      </button>
      {/* Đại diện cho broadcast `store-mode-changed` mà useSync forward vào
          player — PlayerBar.test.tsx render qua PlayerProvider thật, không mock
          useSync, nên phải tự "bắn" xác nhận từ server bằng nút test này. */}
      <button onClick={() => player.setPlaybackMode({ repeat: 'ALL' })}>simulate-repeat-all</button>
      <button onClick={() => player.setPlaybackMode({ repeat: 'ONE' })}>simulate-repeat-one</button>
      <button onClick={() => player.setPlaybackMode({ repeat: 'OFF' })}>simulate-repeat-off</button>
      <button onClick={() => player.setPlaybackMode({ shuffle: true })}>simulate-shuffle-on</button>
    </>
  );
}

const renderBar = () =>
  render(
    <PlayerProvider>
      <StartButton />
      <PlayerBar />
    </PlayerProvider>,
  );

describe('PlayerBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockAudio.instances = [];
    mockPathname = '/store';
  });

  it('stays out of the way until something is playing', () => {
    renderBar();

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the track and artist once playback starts', async () => {
    renderBar();

    await userEvent.click(screen.getByText('start'));

    expect((await screen.findAllByText('Hẹn Em Ở Lần Yêu Thứ 2')).length).toBeGreaterThan(0);
    expect(screen.getByText('Nguyenn, Đặng Tuấn Vũ')).toBeInTheDocument();
  });

  it('toggles between pause and play', async () => {
    renderBar();
    await userEvent.click(screen.getByText('start'));

    const pauseButton = await screen.findByRole('button', { name: /tạm dừng/i });
    await userEvent.click(pauseButton);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^phát$/i })).toBeInTheDocument(),
    );
  });

  it('renders a progress bar with the elapsed and total time', async () => {
    renderBar();
    await userEvent.click(screen.getByText('start'));

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('6:06')).toBeInTheDocument();
  });

  // Màn chiếu treo trong quán chỉ để nhìn — thanh phát có nút bấm không được
  // bén mảng tới đó, kể cả khi nhạc đang chạy.
  it('keeps away from the kiosk screen', async () => {
    mockPathname = '/player/store-1';
    renderBar();

    await userEvent.click(screen.getByText('start'));

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('Hẹn Em Ở Lần Yêu Thứ 2')).not.toBeInTheDocument();
  });

  // Nhân viên quán cần biết còn bao nhiêu bài nữa trong hàng chờ
  it('shows how many tracks are left in the store queue', async () => {
    renderBar();
    await userEvent.click(screen.getByText('start'));

    expect(await screen.findByText(/còn 2 bài/i)).toBeInTheDocument();
  });

  describe('transport controls for a store', () => {
    it('asks the server to skip to the previous track', async () => {
      mockApi.post.mockResolvedValue(undefined);
      renderBar();
      await userEvent.click(screen.getByText('start-middle-track'));

      await userEvent.click(await screen.findByRole('button', { name: 'Bài trước' }));

      expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/previous');
    });

    it('asks the server to skip to the next track', async () => {
      mockApi.post.mockResolvedValue(undefined);
      renderBar();
      await userEvent.click(screen.getByText('start-middle-track'));

      await userEvent.click(await screen.findByRole('button', { name: 'Bài kế tiếp' }));

      expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-1/next');
    });

    // QC: nút chuyển bài ở hai đầu hàng chờ đưa người dùng ra khỏi playlist —
    // bấm "Bài kế tiếp" ở bài cuối làm server dừng hẳn và thanh phát biến mất.
    // Không còn chỗ để đi thì không được có nút.
    describe('hai đầu hàng chờ', () => {
      it('không có nút "Bài trước" ở bài đầu', async () => {
        renderBar();
        await userEvent.click(screen.getByText('start'));

        expect(await screen.findByRole('button', { name: 'Bài kế tiếp' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Bài trước' })).not.toBeInTheDocument();
      });

      it('không có nút "Bài kế tiếp" ở bài cuối', async () => {
        renderBar();
        await userEvent.click(screen.getByText('start-last-track'));

        expect(await screen.findByRole('button', { name: 'Bài trước' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Bài kế tiếp' })).not.toBeInTheDocument();
      });

      it('có cả hai nút khi đang ở giữa hàng chờ', async () => {
        renderBar();
        await userEvent.click(screen.getByText('start-middle-track'));

        expect(await screen.findByRole('button', { name: 'Bài trước' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Bài kế tiếp' })).toBeInTheDocument();
      });

      // `repeat: 'ALL'` thì hàng chờ thành vòng tròn — hai đầu vẫn đi được, nên
      // cả hai nút phải quay lại.
      it('hiện lại cả hai nút ở bài cuối khi server xác nhận lặp ALL', async () => {
        renderBar();
        await userEvent.click(screen.getByText('start-last-track'));
        expect(screen.queryByRole('button', { name: 'Bài kế tiếp' })).not.toBeInTheDocument();

        await userEvent.click(screen.getByText('simulate-repeat-all'));

        expect(await screen.findByRole('button', { name: 'Bài kế tiếp' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Bài trước' })).toBeInTheDocument();
      });
    });

    it('toggles shuffle for the store', async () => {
      mockApi.patch.mockResolvedValue(undefined);
      renderBar();
      await userEvent.click(screen.getByText('start'));

      await userEvent.click(await screen.findByRole('button', { name: 'Phát ngẫu nhiên' }));

      expect(mockApi.patch).toHaveBeenCalledWith('/sync/stores/store-1/playback-mode', {
        shuffle: true,
      });
    });

    // Vòng lặp OFF -> ALL -> ONE -> OFF: mỗi bước chỉ tính từ trạng thái đã được
    // server xác nhận (mô phỏng bằng nút simulate-* — bấm dồn dập không đợi
    // broadcast là lỗi ở người dùng thật, không phải điều component phải tự sửa).
    it('cycles repeat through OFF -> ALL -> ONE -> OFF for the store', async () => {
      mockApi.patch.mockResolvedValue(undefined);
      renderBar();
      await userEvent.click(screen.getByText('start'));

      const repeatButton = await screen.findByRole('button', { name: /lặp lại/i });

      await userEvent.click(repeatButton);
      expect(mockApi.patch).toHaveBeenLastCalledWith('/sync/stores/store-1/playback-mode', {
        repeat: 'ALL',
      });

      await userEvent.click(screen.getByText('simulate-repeat-all'));
      await userEvent.click(screen.getByRole('button', { name: 'Lặp lại danh sách' }));
      expect(mockApi.patch).toHaveBeenLastCalledWith('/sync/stores/store-1/playback-mode', {
        repeat: 'ONE',
      });

      await userEvent.click(screen.getByText('simulate-repeat-one'));
      await userEvent.click(screen.getByRole('button', { name: 'Lặp lại một bài' }));
      expect(mockApi.patch).toHaveBeenLastCalledWith('/sync/stores/store-1/playback-mode', {
        repeat: 'OFF',
      });
    });

    it('shows the active dot and accent color state via aria-pressed once the server confirms shuffle', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));
      await userEvent.click(screen.getByText('simulate-shuffle-on'));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Phát ngẫu nhiên' })).toHaveAttribute(
          'aria-pressed',
          'true',
        ),
      );
    });
  });

  describe('preview mode (nghe thử tại /dashboard/playlists)', () => {
    it('disables previous/next/shuffle with an explanatory title and never calls the sync API', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start-preview'));

      const previousButton = await screen.findByRole('button', { name: 'Bài trước' });
      const nextButton = screen.getByRole('button', { name: 'Bài kế tiếp' });
      const shuffleButton = screen.getByRole('button', { name: 'Phát ngẫu nhiên' });

      expect(previousButton).toBeDisabled();
      expect(nextButton).toBeDisabled();
      expect(shuffleButton).toBeDisabled();
      expect(previousButton.title.toLowerCase()).toContain('nghe thử');
      expect(nextButton.title.toLowerCase()).toContain('nghe thử');
      expect(shuffleButton.title.toLowerCase()).toContain('nghe thử');

      await userEvent.click(previousButton);
      await userEvent.click(nextButton);
      await userEvent.click(shuffleButton);

      expect(mockApi.post).not.toHaveBeenCalled();
      expect(mockApi.patch).not.toHaveBeenCalled();
    });

    it('toggles repeat-one locally via audio.loop without touching the API', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start-preview'));

      const repeatButton = await screen.findByRole('button', { name: /lặp lại/i });
      expect(repeatButton).not.toBeDisabled();

      await userEvent.click(repeatButton);

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Lặp lại một bài' })).toHaveAttribute(
          'aria-pressed',
          'true',
        ),
      );
      expect(MockAudio.instances[MockAudio.instances.length - 1].loop).toBe(true);
      expect(mockApi.patch).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'Lặp lại một bài' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Lặp lại' })).toBeInTheDocument(),
      );
      expect(MockAudio.instances[MockAudio.instances.length - 1].loop).toBe(false);
    });
  });

  // Bug QC: thanh phát mobile xếp 3 hàng (~160px) nhưng shell chỉ chừa 112px,
  // và nó luôn nằm trên nên đè mất menu. Dưới `md` thu về một hàng gọn.
  describe('mini-player trên mobile', () => {
    it('cao đúng --player-bar-h và nằm ở lớp z của thanh phát', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));

      const bar = screen.getByRole('contentinfo', { name: 'Trình phát nhạc' });
      expect(bar.className).toEqual(expect.stringContaining('z-[var(--z-player-bar)]'));
      expect(bar.style.height).toEqual(expect.stringContaining('--player-bar-h'));
      // Chừa vạch home của iPhone.
      expect(bar.className).toEqual(expect.stringContaining('env(safe-area-inset-bottom)'));
    });

    it('ẩn thanh kéo seek và mốc thời gian dưới md nhưng vẫn giữ đúng một progressbar', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));

      // Vẫn đúng một progressbar ở mọi khổ màn hình — vạch mảnh mobile là
      // aria-hidden, không sinh role thứ hai.
      expect(screen.getAllByRole('progressbar')).toHaveLength(1);

      const seekRow = screen.getByRole('progressbar').parentElement;
      expect(seekRow?.className).toEqual(expect.stringContaining('hidden md:flex'));
    });

    it('ẩn cụm âm lượng dưới md', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));

      const volumeGroup = screen.getByRole('slider', { name: 'Âm lượng' }).parentElement;
      expect(volumeGroup?.className).toEqual(expect.stringContaining('hidden md:flex'));
      expect(volumeGroup?.className).not.toEqual(expect.stringMatching(/(^|\s)flex(\s|$)/));
    });

    it('vẫn giữ nút mở toàn màn hình trên mobile — đó là đường vào màn Đang phát', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));

      const expand = screen.getByRole('button', { name: 'Xem toàn màn hình' });
      expect(expand.className).not.toEqual(expect.stringContaining('hidden'));
    });

    it('ẩn shuffle/repeat khỏi thanh phát dưới md, overlay vẫn hiện đủ', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));

      expect(screen.getByRole('button', { name: 'Phát ngẫu nhiên' }).className).toEqual(
        expect.stringContaining('hidden md:inline-flex'),
      );
      expect(screen.getByRole('button', { name: /lặp lại/i }).className).toEqual(
        expect.stringContaining('hidden md:inline-flex'),
      );
    });
  });

  describe('volume control', () => {
    it('mutes and restores the previous volume level', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));

      const muteButton = await screen.findByRole('button', { name: 'Tắt tiếng' });
      const volumeSlider = screen.getByRole('slider', { name: 'Âm lượng' });

      // Kéo về một mức khác 100% trước khi tắt, để kiểm tra đúng mức được nhớ
      // lại (không phải luôn nhảy về 100%).
      act(() => {
        volumeSlider.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await userEvent.click(volumeSlider);

      await userEvent.click(muteButton);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Bật tiếng' })).toBeInTheDocument(),
      );
      expect(MockAudio.instances[MockAudio.instances.length - 1].volume).toBe(0);

      await userEvent.click(screen.getByRole('button', { name: 'Bật tiếng' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Tắt tiếng' })).toBeInTheDocument(),
      );
      expect(MockAudio.instances[MockAudio.instances.length - 1].volume).toBeGreaterThan(0);
    });
  });

  describe('fullscreen now playing overlay', () => {
    let fullscreenElement: Element | null = null;

    beforeEach(() => {
      fullscreenElement = null;
      Element.prototype.requestFullscreen = jest.fn(function (this: Element) {
        fullscreenElement = this;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      }) as unknown as Element['requestFullscreen'];
      document.exitFullscreen = jest.fn(() => {
        fullscreenElement = null;
        document.dispatchEvent(new Event('fullscreenchange'));
        return Promise.resolve();
      });
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => fullscreenElement,
      });
    });

    it('opens the fullscreen now playing view via requestFullscreen', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));

      await userEvent.click(screen.getByRole('button', { name: 'Xem toàn màn hình' }));

      expect(
        await screen.findByRole('dialog', { name: /đang phát toàn màn hình/i }),
      ).toBeInTheDocument();
      expect(Element.prototype.requestFullscreen).toHaveBeenCalled();
    });

    it('closes via the close button and exits fullscreen', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));
      await userEvent.click(screen.getByRole('button', { name: 'Xem toàn màn hình' }));
      await screen.findByRole('dialog');

      await userEvent.click(screen.getByRole('button', { name: 'Đóng toàn màn hình' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(document.exitFullscreen).toHaveBeenCalled();
    });

    // Người dùng thoát bằng ESC/F11 của trình duyệt, không đi qua nút Đóng của
    // ta — overlay vẫn phải đóng nhờ nghe `fullscreenchange`, không kẹt lại.
    it('closes when the browser exits fullscreen on its own, syncing via fullscreenchange', async () => {
      renderBar();
      await userEvent.click(screen.getByText('start'));
      await userEvent.click(screen.getByRole('button', { name: 'Xem toàn màn hình' }));
      await screen.findByRole('dialog');

      await act(async () => {
        fullscreenElement = null;
        document.dispatchEvent(new Event('fullscreenchange'));
      });

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });
});
