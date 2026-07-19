import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TracksPage from '../../src/app/dashboard/tracks/page';
import { api } from '../../src/lib/api-client';
import { toast } from 'sonner';

jest.mock('../../src/lib/api-client', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    postMultipart: jest.fn(),
  },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockApi = api as jest.Mocked<typeof api>;

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

const tracks = [
  {
    id: 'track-1',
    title: 'Song One',
    artist: 'Artist A',
    durationMs: 0,
    source: 'SELF_HOSTED',
    s3Key: 'k1',
    externalProvider: null,
    externalId: null,
    organizationId: 'org-1',
    createdAt: '',
  },
];

describe('TracksPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/tracks') return Promise.resolve({ data: tracks });
      if (path.endsWith('/stream-url'))
        return Promise.resolve({ url: 'https://s3/presigned.mp3', expiresIn: 3600 });
      return Promise.resolve({ data: [] });
    });
  });

  it('should show success toast after uploading a file', async () => {
    mockApi.postMultipart.mockResolvedValue({ id: 'track-2', title: 'new-song' });

    render(<TracksPage />);
    await waitFor(() => expect(screen.getByText('Song One')).toBeInTheDocument());

    const input = screen.getByLabelText(/select audio file/i);
    const file = new File(['x'], 'new-song.mp3', { type: 'audio/mpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mockApi.postMultipart).toHaveBeenCalledWith('/tracks', expect.any(FormData)),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('should show error toast when upload fails', async () => {
    mockApi.postMultipart.mockRejectedValue(new Error('boom'));

    render(<TracksPage />);
    const input = await screen.findByLabelText(/select audio file/i);
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'bad.mp3', { type: 'audio/mpeg' })] },
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  it('should render a play button for each track and stream it on click', async () => {
    render(<TracksPage />);
    const playBtn = await screen.findByRole('button', { name: /play song one/i });

    fireEvent.click(playBtn);

    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith('/tracks/track-1/stream-url'));
    await waitFor(() => expect(mockAudio.play).toHaveBeenCalled());
  });
});
