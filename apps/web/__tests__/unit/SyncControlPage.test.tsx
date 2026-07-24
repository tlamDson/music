import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import SyncPage from '../../src/app/dashboard/sync/page';
import { api, ApiError } from '../../src/lib/api-client';
import { useSyncGroups } from '../../src/hooks/useSyncGroups';
import { useClockOffset } from '../../src/hooks/useClockOffset';

jest.mock('../../src/lib/api-client', () => {
  class ApiError extends Error {
    status: number;
    data?: unknown;
    constructor(status: number, message: string, data?: unknown) {
      super(message);
      this.status = status;
      this.data = data;
    }
  }
  return { api: { get: jest.fn(), post: jest.fn() }, ApiError };
});
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/hooks/useSyncGroups', () => ({ useSyncGroups: jest.fn() }));
jest.mock('../../src/hooks/useClockOffset', () => ({ useClockOffset: jest.fn() }));

const mockApi = api as jest.Mocked<typeof api>;
const mockUseSyncGroups = useSyncGroups as jest.MockedFunction<typeof useSyncGroups>;
const mockUseClockOffset = useClockOffset as jest.MockedFunction<typeof useClockOffset>;
const mockToast = toast as unknown as { success: jest.Mock; error: jest.Mock };

describe('Sync Control page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseClockOffset.mockReturnValue({ offset: 0, measureOffset: jest.fn() });
    mockUseSyncGroups.mockReturnValue({
      groups: [
        { id: 'group-1', name: 'Main', mode: 'LOOSE', status: 'STOPPED', _count: { stores: 2 } },
      ],
      defaultGroupId: 'group-1',
      loading: false,
    });
    mockApi.get.mockImplementation((path: string) => {
      if (path === '/playlists') {
        return Promise.resolve({ data: [{ id: 'pl-1', name: 'Playlist A' }] });
      }
      if (path.endsWith('/state')) return Promise.resolve(null);
      return Promise.resolve(null);
    });
  });

  const selectPlaylistAndPlay = async () => {
    render(<SyncPage />);
    await waitFor(() => screen.getByText('Playlist A'));
    await userEvent.selectOptions(screen.getByLabelText(/playlist phát/i), 'pl-1');
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
  };

  // Toast trước đây luôn đoán "playlist có track chưa" bất kể lý do lỗi thật
  // là gì — che mất lỗi thật (vd presign S3 500, sai scope playlist).
  it('shows the real backend error message when play fails', async () => {
    mockApi.post.mockRejectedValue(new ApiError(500, 'Something went wrong presigning the URL'));

    await selectPlaylistAndPlay();

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Something went wrong presigning the URL'),
    );
  });

  it('falls back to a generic message when the error has no readable message', async () => {
    mockApi.post.mockRejectedValue(new Error());

    await selectPlaylistAndPlay();

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Phát thất bại'));
  });
});
