'use client';

import { useEffect, useState } from 'react';
import { useSync } from '../../hooks/useSync';
import { useClockOffset } from '../../hooks/useClockOffset';
import { api } from '../../lib/api-client';
import type { ApiResponse, Store } from '@cafe-music/shared';

/** Không render gì — chỉ mở một socket sync cho một quán cụ thể. Tách riêng để
 * `StoresSyncBridge` dựng được nhiều instance (một cho mỗi quán) mà vẫn tuân
 * thủ rules of hooks — mỗi instance chỉ gọi `useSync` đúng một lần. */
function StoreSyncSubscriber({
  storeId,
  token,
  clockOffset,
}: {
  storeId: string;
  token: string | null;
  clockOffset: number;
}) {
  useSync({ storeId, token, clockOffset });
  return null;
}

/**
 * Không render gì — chỉ mở socket sync cho dashboard của ORG_ADMIN, để admin
 * bấm phát ở quán nào thì chính tab của mình cũng nghe được bài đó.
 *
 * Từng join theo sync group; giờ tầng nhóm đã bị bỏ nên subscribe theo **từng
 * quán** của tổ chức. Vẫn giữ nguyên bài học cũ: phải mở cho mọi quán chứ không
 * chỉ quán đầu tiên, nếu không bấm Play cho quán thứ hai trở đi vẫn trả 200
 * nhưng tab admin im lặng hoàn toàn.
 */
export default function StoresSyncBridge() {
  const [token, setToken] = useState<string | null>(null);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const { offset, measureOffset } = useClockOffset();

  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
    void measureOffset();

    api
      .get<ApiResponse<Store[]>>('/stores')
      .then((res) => setStoreIds(res.data.map((store) => store.id)))
      .catch(() => setStoreIds([]));
  }, [measureOffset]);

  return (
    <>
      {storeIds.map((storeId) => (
        <StoreSyncSubscriber key={storeId} storeId={storeId} token={token} clockOffset={offset} />
      ))}
    </>
  );
}
