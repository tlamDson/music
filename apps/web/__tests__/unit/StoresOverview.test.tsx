import { screen } from '@testing-library/react';
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
    status: 'PLAYING',
    trackId: 'track-9',
    isPlaying: true,
    queueRemaining: 3,
    connectedScreens: 2,
  },
  {
    storeId: 'store-2',
    name: 'Quán Lê Lợi',
    status: 'STOPPED',
    trackId: null,
    isPlaying: false,
    queueRemaining: null,
    connectedScreens: 0,
  },
];

describe('StoresOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: overview });
  });

  it('cho biết quán nào đang phát, quán nào im lặng', async () => {
    renderWithPlayer(<StoresOverview />);

    expect(await screen.findByText('Quán Nguyễn Huệ')).toBeInTheDocument();
    expect(screen.getByText(/đang phát/i)).toBeInTheDocument();
    expect(screen.getByText(/đang im lặng/i)).toBeInTheDocument();
  });

  // Admin bấm phát xong cần biết có màn hình nào thật sự nghe được không
  it('hiện số màn hình đang kết nối của từng quán', async () => {
    renderWithPlayer(<StoresOverview />);

    expect(await screen.findByText(/2 màn hình đang kết nối/i)).toBeInTheDocument();
    expect(screen.getByText(/chưa có màn hình nào/i)).toBeInTheDocument();
  });

  it('hiện số bài còn lại trong hàng chờ', async () => {
    renderWithPlayer(<StoresOverview />);

    expect(await screen.findByText(/còn 3 bài trong hàng chờ/i)).toBeInTheDocument();
  });

  // Phát nhạc chỉ làm được ở trang chi tiết quán, nên mỗi thẻ phải dẫn tới đó
  it('mỗi quán là một link vào trang chi tiết để chọn nhạc', async () => {
    renderWithPlayer(<StoresOverview />);

    const link = await screen.findByRole('link', { name: /quán nguyễn huệ/i });
    expect(link).toHaveAttribute('href', '/dashboard/stores/store-1');
  });
});
