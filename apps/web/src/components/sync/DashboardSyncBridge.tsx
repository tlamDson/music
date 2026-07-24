'use client';

import { useEffect, useState } from 'react';
import { useSync } from '../../hooks/useSync';
import { useSyncGroups } from '../../hooks/useSyncGroups';
import { useClockOffset } from '../../hooks/useClockOffset';

/**
 * Không render gì — chỉ mở socket sync cho dashboard của ORG_ADMIN. Trước đây
 * chỉ console quán và màn `/player` mới nghe WebSocket, nên admin bấm phát xong
 * chính tab của mình cũng không thấy thanh nhạc. Mount cái này ở dashboard để
 * event `now-playing` quay về đúng tab admin và đổ vào thanh phát dùng chung.
 */
export default function DashboardSyncBridge() {
  const [token, setToken] = useState<string | null>(null);
  const { defaultGroupId } = useSyncGroups();
  const { offset, measureOffset } = useClockOffset();

  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
    void measureOffset();
  }, [measureOffset]);

  useSync({ groupId: defaultGroupId, token, clockOffset: offset });

  return null;
}
