import { screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackLibrary from '../../src/components/track/TrackLibrary';
import { renderWithPlayer } from '../utils/renderWithPlayer';
import { api } from '../../src/lib/api-client';
import { toast } from 'sonner';

jest.mock('../../src/lib/api-client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    postMultipart: jest.fn(),
  },
}));

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockApi = api as jest.Mocked<typeof api>;

const mockAudio = {
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn(),
  src: '',
  currentTime: 0,
  duration: 245,
  volume: 1,
  addEventListener: jest.fn((event: string, handler: () => void) => {
    if (event === 'loadedmetadata') handler();
  }),
  removeEventListener: jest.fn(),
};
Object.defineProperty(global, 'Audio', { writable: true, value: jest.fn(() => mockAudio) });
Object.defineProperty(global.URL, 'createObjectURL', {
  writable: true,
  value: jest.fn(() => 'blob:x'),
});
Object.defineProperty(global.URL, 'revokeObjectURL', { writable: true, value: jest.fn() });

const chainTrack = {
  id: 'track-1',
  title: 'Song One',
  artist: 'Artist A',
  durationMs: 245_000,
  source: 'SELF_HOSTED',
  s3Key: 'k1',
  externalProvider: null,
  externalId: null,
  organizationId: 'org-1',
  storeId: null,
  createdAt: '',
};

const storeTrack = { ...chainTrack, id: 'track-2', title: 'Nhạc quán', storeId: 'store-1' };

describe('TrackLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockImplementation((path: string) => {
      if (path.endsWith('/stream-url'))
        return Promise.resolve({ url: 'https://s3/presigned.mp3', expiresIn: 3600 });
      return Promise.resolve({ data: [chainTrack, storeTrack] });
    });
  });

  const renderLibrary = (role: 'ORG_ADMIN' | 'STORE_ADMIN' = 'ORG_ADMIN') =>
    renderWithPlayer(
      <TrackLibrary role={role} storeId={role === 'STORE_ADMIN' ? 'store-1' : null} />,
    );

  it('fetches the library with a higher page size than the backend default', async () => {
    renderLibrary();
    await screen.findByText('Song One');

    expect(mockApi.get).toHaveBeenCalledWith('/tracks?limit=100');
  });

  it('lists tracks with artist and duration', async () => {
    renderLibrary();

    const row = await screen.findByRole('row', { name: /song one/i });
    expect(row).toHaveTextContent('Artist A');
    expect(row).toHaveTextContent('4:05');
  });

  it('opens a metadata dialog prefilled from the filename before uploading', async () => {
    mockApi.postMultipart.mockResolvedValue({ id: 'track-3' });
    renderLibrary();
    await screen.findByText('Song One');

    const input = await screen.findByLabelText(/chọn file nhạc/i);
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'new-song.mp3', { type: 'audio/mpeg' })] },
    });

    const dialog = await screen.findByRole('dialog', { name: /thông tin bài hát/i });
    expect(within(dialog).getByLabelText('Tên bài hát')).toHaveValue('new-song');

    await userEvent.type(within(dialog).getByLabelText('Ca sĩ'), 'Sơn Tùng');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tải lên' }));

    await waitFor(() => expect(mockApi.postMultipart).toHaveBeenCalled());
    const formData = mockApi.postMultipart.mock.calls[0][1] as FormData;
    expect(formData.get('durationMs')).toBe('245000');
    expect(formData.get('title')).toBe('new-song');
    expect(formData.get('artist')).toBe('Sơn Tùng');
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('does not send an artist field when left blank', async () => {
    mockApi.postMultipart.mockResolvedValue({ id: 'track-3' });
    renderLibrary();
    await screen.findByText('Song One');

    const input = await screen.findByLabelText(/chọn file nhạc/i);
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'no-artist.mp3', { type: 'audio/mpeg' })] },
    });

    const dialog = await screen.findByRole('dialog', { name: /thông tin bài hát/i });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tải lên' }));

    await waitFor(() => expect(mockApi.postMultipart).toHaveBeenCalled());
    const formData = mockApi.postMultipart.mock.calls[0][1] as FormData;
    expect(formData.get('artist')).toBeNull();
  });

  it('edits a track title and artist through the row edit button', async () => {
    mockApi.patch.mockResolvedValue({});
    renderLibrary();

    await userEvent.click(await screen.findByRole('button', { name: /sửa song one/i }));
    const dialog = await screen.findByRole('dialog', { name: /sửa bài hát/i });
    expect(within(dialog).getByLabelText('Tên bài hát')).toHaveValue('Song One');
    expect(within(dialog).getByLabelText('Ca sĩ')).toHaveValue('Artist A');

    await userEvent.clear(within(dialog).getByLabelText('Tên bài hát'));
    await userEvent.type(within(dialog).getByLabelText('Tên bài hát'), 'Song One Renamed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith('/tracks/track-1', {
        title: 'Song One Renamed',
        artist: 'Artist A',
      }),
    );
    expect(await screen.findByText('Song One Renamed')).toBeInTheDocument();
  });

  it('streams a track when its play button is used', async () => {
    renderLibrary();

    await userEvent.click(await screen.findByRole('button', { name: /phát song one/i }));

    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/tracks/track-1/stream-url'));
    await waitFor(() => expect(mockAudio.play).toHaveBeenCalled());
  });

  it('deletes a track', async () => {
    mockApi.delete.mockResolvedValue({ message: 'ok' });
    renderLibrary();

    await userEvent.click(await screen.findByRole('button', { name: /xóa song one/i }));

    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith('/tracks/track-1'));
  });

  // Track chung của chuỗi là của mọi quán — quán chỉ xóa/sửa được nhạc mình upload
  it('hides the edit and delete buttons on chain tracks from a store admin', async () => {
    renderLibrary('STORE_ADMIN');
    await screen.findByRole('row', { name: /song one/i });

    expect(screen.queryByRole('button', { name: /sửa song one/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xóa song one/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sửa nhạc quán/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xóa nhạc quán/i })).toBeInTheDocument();
  });

  it('tells a store admin their upload stays private to the shop', async () => {
    renderLibrary('STORE_ADMIN');

    expect(await screen.findByText(/chỉ quán bạn nghe được/i)).toBeInTheDocument();
  });
});
