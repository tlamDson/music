import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackLibrary from '../../src/components/track/TrackLibrary';
import { renderWithPlayer } from '../utils/renderWithPlayer';
import { api } from '../../src/lib/api-client';
import { toast } from 'sonner';

jest.mock('../../src/lib/api-client', () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn(), postMultipart: jest.fn() },
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

  it('lists tracks with artist and duration', async () => {
    renderLibrary();

    const row = await screen.findByRole('row', { name: /song one/i });
    expect(row).toHaveTextContent('Artist A');
    expect(row).toHaveTextContent('4:05');
  });

  it('measures the file and sends its duration on upload', async () => {
    mockApi.postMultipart.mockResolvedValue({ id: 'track-3' });
    renderLibrary();

    const input = await screen.findByLabelText(/chọn file nhạc/i);
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'new-song.mp3', { type: 'audio/mpeg' })] },
    });

    await waitFor(() => expect(mockApi.postMultipart).toHaveBeenCalled());
    const formData = mockApi.postMultipart.mock.calls[0][1] as FormData;
    expect(formData.get('durationMs')).toBe('245000');
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
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

  // Track chung của chuỗi là của mọi quán — quán chỉ xóa được nhạc mình upload
  it('hides the delete button on chain tracks from a store admin', async () => {
    renderLibrary('STORE_ADMIN');
    await screen.findByRole('row', { name: /song one/i });

    expect(screen.queryByRole('button', { name: /xóa song one/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xóa nhạc quán/i })).toBeInTheDocument();
  });

  it('tells a store admin their upload stays private to the shop', async () => {
    renderLibrary('STORE_ADMIN');

    expect(await screen.findByText(/chỉ quán bạn nghe được/i)).toBeInTheDocument();
  });
});
