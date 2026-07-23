import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoresOverview from '../../src/components/store/StoresOverview';
import { renderWithPlayer } from '../utils/renderWithPlayer';
import { api } from '../../src/lib/api-client';

jest.mock('../../src/lib/api-client', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockApi = api as jest.Mocked<typeof api>;

const overview = [
  {
    storeId: 'store-1',
    name: 'Quán Nguyễn Huệ',
    syncGroupId: 'group-1',
    syncGroupName: 'Nhóm chính',
    isOverridden: false,
    trackId: 'track-9',
    isPlaying: true,
    queueRemaining: null,
  },
  {
    storeId: 'store-2',
    name: 'Quán Lê Lợi',
    syncGroupId: 'group-1',
    syncGroupName: 'Nhóm chính',
    isOverridden: true,
    trackId: 'track-2',
    isPlaying: true,
    queueRemaining: 1,
  },
];

describe('StoresOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: overview });
  });

  it('shows which group each store follows', async () => {
    renderWithPlayer(<StoresOverview />);

    expect(await screen.findByText('Quán Nguyễn Huệ')).toBeInTheDocument();
    expect(screen.getAllByText(/nhóm chính/i).length).toBeGreaterThan(0);
  });

  // Đây là câu hỏi admin hay hỏi nhất: quán nào đang tự phát nhạc riêng?
  it('flags the store that detached and how many tracks are left', async () => {
    renderWithPlayer(<StoresOverview />);

    expect(await screen.findByText(/đang phát nhạc riêng/i)).toBeInTheDocument();
    expect(screen.getByText(/còn 1 bài/i)).toBeInTheDocument();
  });

  it('pulls a detached store back into the group', async () => {
    mockApi.post.mockResolvedValue({ rejoined: true });
    renderWithPlayer(<StoresOverview />);

    await userEvent.click(await screen.findByRole('button', { name: /kéo quán lê lợi về nhóm/i }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('/sync/stores/store-2/rejoin'));
  });

  it('offers no rejoin button for stores already following the group', async () => {
    renderWithPlayer(<StoresOverview />);
    await screen.findByText('Quán Nguyễn Huệ');

    expect(
      screen.queryByRole('button', { name: /kéo quán nguyễn huệ về nhóm/i }),
    ).not.toBeInTheDocument();
  });
});
