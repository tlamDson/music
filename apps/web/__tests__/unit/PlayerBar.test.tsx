import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerProvider, usePlayer } from '../../src/components/player/PlayerProvider';
import PlayerBar from '../../src/components/player/PlayerBar';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

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
          { mode: 'local', storeId: 'store-1', queue: { index: 0, total: 3, remaining: 2 } },
        )
      }
    >
      start
    </button>
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

    expect(await screen.findByText('Hẹn Em Ở Lần Yêu Thứ 2')).toBeInTheDocument();
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

  // Quán tách khỏi nhóm cần biết còn bao nhiêu bài trước khi tự quay lại
  it('shows how many tracks are left before returning to the sync group', async () => {
    renderBar();
    await userEvent.click(screen.getByText('start'));

    expect(await screen.findByText(/còn 2 bài/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quay lại nhóm sync/i })).toBeInTheDocument();
  });
});
