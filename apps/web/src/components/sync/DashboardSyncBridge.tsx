'use client';

import { useEffect, useState } from 'react';
import { useSync } from '../../hooks/useSync';
import { useSyncGroups } from '../../hooks/useSyncGroups';
import { useClockOffset } from '../../hooks/useClockOffset';

/** Không render gì — chỉ mở một socket sync cho một nhóm cụ thể. Tách riêng để
 * `DashboardSyncBridge` có thể dựng nhiều instance (một cho mỗi nhóm) mà vẫn
 * tuân thủ rules of hooks — mỗi instance chỉ gọi `useSync` đúng một lần. */
function GroupSyncSubscriber({
  groupId,
  token,
  clockOffset,
}: {
  groupId: string;
  token: string | null;
  clockOffset: number;
}) {
  useSync({ groupId, token, clockOffset });
  return null;
}

/**
 * Không render gì — chỉ mở socket sync cho dashboard của ORG_ADMIN. Trước đây
 * chỉ console quán và màn `/player` mới nghe WebSocket, nên admin bấm phát xong
 * chính tab của mình cũng không thấy thanh nhạc. Mount cái này ở dashboard để
 * event `now-playing` quay về đúng tab admin và đổ vào thanh phát dùng chung.
 *
 * Từng chỉ join `defaultGroupId` (group đầu tiên) — admin bấm Play cho nhóm
 * thứ hai trở đi thì request vẫn 200 nhưng audio im lặng hoàn toàn, vì socket
 * của admin không nằm trong room `sync-group:<id>` của nhóm đó. Giờ mở một
 * subscriber cho mỗi nhóm của tổ chức.
 */
export default function DashboardSyncBridge() {
  const [token, setToken] = useState<string | null>(null);
  const { groups } = useSyncGroups();
  const { offset, measureOffset } = useClockOffset();

  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
    void measureOffset();
  }, [measureOffset]);

  return (
    <>
      {groups.map((group) => (
        <GroupSyncSubscriber key={group.id} groupId={group.id} token={token} clockOffset={offset} />
      ))}
    </>
  );
}
