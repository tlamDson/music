import { useEffect } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackTable, { type TrackTableRow } from '../../src/components/track/TrackTable';
import { PlayerProvider, usePlayer } from '../../src/components/player/PlayerProvider';
import type { Track } from '@cafe-music/shared';

// PlayerProvider dựng `new Audio()` — jsdom không implement play(), mock tối thiểu
// (giống PlaylistDetail.test.tsx / TrackLibrary.test.tsx).
class MockAudio {
  src = '';
  currentTime = 0;
  duration = 180;
  volume = 1;
  paused = true;
  addEventListener() {}
  removeEventListener() {}
  play = jest.fn(async () => {
    this.paused = false;
  });
  pause = jest.fn(() => {
    this.paused = true;
  });
}
Object.defineProperty(global, 'Audio', { writable: true, value: MockAudio });

const track = (
  id: string,
  title: string,
  durationMs: number,
  artist: string | null = null,
): Track => ({
  id,
  title,
  artist,
  durationMs,
  source: 'SELF_HOSTED',
  s3Key: `${id}.mp3`,
  externalProvider: null,
  externalId: null,
  organizationId: 'org-1',
  storeId: null,
  createdAt: '',
});

const rows: TrackTableRow[] = [
  {
    id: 'track-1',
    track: track('track-1', 'Song One', 245_000, 'Artist A'),
    addedAt: '2026-07-20T10:00:00.000Z',
  },
  {
    id: 'track-2',
    track: track('track-2', 'Song Two', 180_000, 'Artist B'),
    addedAt: '2026-07-25T10:00:00.000Z',
  },
];

// Bơm track "đang phát" thật vào PlayerProvider để TrackTable tự phát hiện
// hàng nào đang phát qua usePlayer(), không cần prop riêng.
function PlayTrackOnMount({ id, title }: { id: string; title: string }) {
  const { playTrack } = usePlayer();
  useEffect(() => {
    playTrack({ id, title, url: `https://s3/${id}.mp3` }, { mode: 'preview' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderTable(ui: React.ReactElement) {
  return render(<PlayerProvider>{ui}</PlayerProvider>);
}

describe('TrackTable', () => {
  it('shows the row index and a hover/focus play button for each track', () => {
    renderTable(<TrackTable rows={rows} onPlay={jest.fn()} />);

    const row = screen.getByRole('row', { name: /song one/i });
    expect(row).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /phát song one/i })).toBeInTheDocument();
  });

  it('calls onPlay with the row and its index when the play button is used', async () => {
    const onPlay = jest.fn();
    renderTable(<TrackTable rows={rows} onPlay={onPlay} />);

    await userEvent.click(await screen.findByRole('button', { name: /phát song two/i }));

    expect(onPlay).toHaveBeenCalledWith(rows[1], 1);
  });

  it('marks the currently playing row with the sound-wave state and a pause control', async () => {
    renderTable(
      <>
        <PlayTrackOnMount id="track-1" title="Song One" />
        <TrackTable rows={rows} onPlay={jest.fn()} />
      </>,
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /tạm dừng song one/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /^phát song one$/i })).not.toBeInTheDocument();
    // Bài chưa phát vẫn giữ nguyên nút "phát"
    expect(screen.getByRole('button', { name: /phát song two/i })).toBeInTheDocument();
  });

  it('only shows the "Ngày thêm" column when showAddedAt is enabled', () => {
    const { rerender } = render(
      <PlayerProvider>
        <TrackTable rows={rows} onPlay={jest.fn()} />
      </PlayerProvider>,
    );
    expect(screen.queryByText('Ngày thêm')).not.toBeInTheDocument();

    rerender(
      <PlayerProvider>
        <TrackTable rows={rows} onPlay={jest.fn()} showAddedAt />
      </PlayerProvider>,
    );
    expect(screen.getByText('Ngày thêm')).toBeInTheDocument();
    expect(screen.getByText('20/07/2026')).toBeInTheDocument();
  });

  it('only renders the remove button when canRemove allows it', () => {
    const onRemove = jest.fn();
    renderTable(
      <TrackTable
        rows={rows}
        onPlay={jest.fn()}
        onRemove={onRemove}
        canRemove={(row) => row.id !== 'track-2'}
      />,
    );

    expect(screen.getByRole('button', { name: /xóa song one/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xóa song two/i })).not.toBeInTheDocument();
  });

  it('does not render a remove button at all when onRemove is not provided', () => {
    renderTable(<TrackTable rows={rows} onPlay={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /xóa/i })).not.toBeInTheDocument();
  });

  it('reports a drag-and-drop reorder through onReorder', () => {
    const onReorder = jest.fn();
    renderTable(<TrackTable rows={rows} onPlay={jest.fn()} draggable onReorder={onReorder} />);

    // getAllByRole('row') gồm cả hàng <thead>, nên hàng dữ liệu bắt đầu từ index 1.
    const dataRows = screen.getAllByRole('row');
    fireEvent.dragStart(dataRows[2]); // hàng thứ hai (Song Two, index 1)
    fireEvent.drop(dataRows[1]); // thả vào hàng đầu (Song One, index 0)

    expect(onReorder).toHaveBeenCalledWith(1, 0);
  });

  it('shows the edit button when onEdit is provided and calls it with the row', async () => {
    const onEdit = jest.fn();
    renderTable(<TrackTable rows={rows} onPlay={jest.fn()} onEdit={onEdit} />);

    await userEvent.click(await screen.findByRole('button', { name: /sửa song one/i }));

    expect(onEdit).toHaveBeenCalledWith(rows[0], 0);
  });

  it('does not render an edit button at all when onEdit is not provided', () => {
    renderTable(<TrackTable rows={rows} onPlay={jest.fn()} />);

    expect(screen.queryByRole('button', { name: /sửa/i })).not.toBeInTheDocument();
  });

  it('only shows the edit button when canEdit allows it', () => {
    renderTable(
      <TrackTable
        rows={rows}
        onPlay={jest.fn()}
        onEdit={jest.fn()}
        canEdit={(row) => row.id !== 'track-2'}
      />,
    );

    expect(screen.getByRole('button', { name: /sửa song one/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sửa song two/i })).not.toBeInTheDocument();
  });

  it('renders page-specific extra columns passed in by the caller', () => {
    renderTable(
      <TrackTable
        rows={rows}
        onPlay={jest.fn()}
        extraColumns={[{ key: 'scope', header: 'Phạm vi', render: () => 'Của chuỗi' }]}
      />,
    );

    expect(screen.getByText('Phạm vi')).toBeInTheDocument();
    expect(screen.getAllByText('Của chuỗi')).toHaveLength(2);
  });
});
