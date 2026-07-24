import { render } from '@testing-library/react';
import DashboardSyncBridge from '../../src/components/sync/DashboardSyncBridge';
import { useSync } from '../../src/hooks/useSync';
import { useSyncGroups } from '../../src/hooks/useSyncGroups';
import { useClockOffset } from '../../src/hooks/useClockOffset';

jest.mock('../../src/hooks/useSync', () => ({ useSync: jest.fn() }));
jest.mock('../../src/hooks/useSyncGroups', () => ({ useSyncGroups: jest.fn() }));
jest.mock('../../src/hooks/useClockOffset', () => ({ useClockOffset: jest.fn() }));

const mockUseSync = useSync as jest.MockedFunction<typeof useSync>;
const mockUseSyncGroups = useSyncGroups as jest.MockedFunction<typeof useSyncGroups>;
const mockUseClockOffset = useClockOffset as jest.MockedFunction<typeof useClockOffset>;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseSync.mockReturnValue({ isConnected: true, nowPlaying: null, storeQueue: null });
  mockUseClockOffset.mockReturnValue({ offset: 0, measureOffset: jest.fn() });
  Object.defineProperty(window, 'localStorage', {
    value: { getItem: jest.fn().mockReturnValue('token-123') },
    writable: true,
  });
});

// Trước đây bridge chỉ join groups[0] (defaultGroupId) — admin bấm Play cho
// nhóm thứ hai trở đi thì broadcast now-playing không bao giờ về tới tab admin
// dù request 200, vì socket của admin không ở trong room của nhóm đó.
describe('DashboardSyncBridge', () => {
  it('subscribes to every sync group of the organization, not just the first one', () => {
    mockUseSyncGroups.mockReturnValue({
      groups: [
        { id: 'group-1', name: 'Main', mode: 'LOOSE', status: 'STOPPED' },
        { id: 'group-2', name: 'Second', mode: 'LOOSE', status: 'STOPPED' },
      ],
      defaultGroupId: 'group-1',
      loading: false,
    });

    render(<DashboardSyncBridge />);

    // useSync gọi lại theo mỗi lần GroupSyncSubscriber re-render (vd token
    // load xong) nên không so đếm lần gọi — chỉ cần đúng tập group đã join.
    const groupIdsSubscribed = new Set(mockUseSync.mock.calls.map((call) => call[0].groupId));
    expect(groupIdsSubscribed).toEqual(new Set(['group-1', 'group-2']));
  });

  it('subscribes to nothing while the group list is still loading', () => {
    // defaultGroupId không còn được component đọc — giá trị ở đây không quan
    // trọng, chỉ cần đúng kiểu (hook suy ra kiểu `string` dù thực tế có thể
    // rỗng vì tsconfig không bật noUncheckedIndexedAccess).
    mockUseSyncGroups.mockReturnValue({ groups: [], defaultGroupId: '', loading: true });

    render(<DashboardSyncBridge />);

    expect(mockUseSync).not.toHaveBeenCalled();
  });
});
