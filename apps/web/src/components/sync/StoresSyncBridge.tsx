'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSync } from '../../hooks/useSync';
import { useClockOffset } from '../../hooks/useClockOffset';
import { api } from '../../lib/api-client';
import type {
  ApiResponse,
  Store,
  WsStoreNowPlayingPayload,
  StoreRepeatMode,
} from '@cafe-music/shared';

export interface StoreSyncSnapshot {
  isConnected: boolean;
  /** Hàng chờ đang phát của quán; null = quán chưa phát gì. */
  storeQueue: WsStoreNowPlayingPayload['queue'] | null;
  /** Playlist đang phát của quán; null khi chưa phát gì hoặc chưa hydrate xong. */
  playlistId: string | null;
  repeat: StoreRepeatMode;
  shuffle: boolean;
}

const DEFAULT_SNAPSHOT: StoreSyncSnapshot = {
  isConnected: false,
  storeQueue: null,
  playlistId: null,
  repeat: 'OFF',
  shuffle: false,
};

/**
 * External store module-level (cùng kiểu với `PositionStore` trong
 * `PlayerProvider`) — KHÔNG phải React Context, vì `StoresSyncBridge` được
 * mount như một sibling của `{children}` ở `dashboard/layout.tsx` chứ không
 * bọc quanh nó (đổi sang bọc quanh sẽ phải sửa layout, ngoài phạm vi file cho
 * phép của đợt này). Dùng `useSyncExternalStore` để mọi nơi trong cây gọi
 * `useStoresSync(storeId)` đọc được state mà không cần một Provider ancestor.
 */
let snapshotsById: Record<string, StoreSyncSnapshot> = {};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(storeId: string, snapshot: StoreSyncSnapshot) {
  snapshotsById = { ...snapshotsById, [storeId]: snapshot };
  emit();
}

function removeSnapshot(storeId: string) {
  if (!(storeId in snapshotsById)) return;
  const next = { ...snapshotsById };
  delete next[storeId];
  snapshotsById = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshots() {
  return snapshotsById;
}

/**
 * Đọc trạng thái sync (queue/playlist/repeat/shuffle đang phát) của **một
 * quán cụ thể** từ socket mà `StoresSyncBridge` đang giữ ở dashboard layout —
 * để trang chi tiết quán biết ngay khi có đổi bài, không phải chờ tới lần
 * poll 10 giây kế tiếp (`GET /stores/:id`).
 */
export function useStoresSync(storeId: string | null): StoreSyncSnapshot {
  const all = useSyncExternalStore(subscribe, getSnapshots, getSnapshots);
  if (!storeId) return DEFAULT_SNAPSHOT;
  return all[storeId] ?? DEFAULT_SNAPSHOT;
}

/** Không render gì — chỉ mở một socket sync cho một quán cụ thể, và báo cáo
 * trạng thái của nó lên external store theo đúng `storeId`. Tách riêng để
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
  const { isConnected, storeQueue, playlistId, repeat, shuffle } = useSync({
    storeId,
    token,
    clockOffset,
  });

  useEffect(() => {
    setSnapshot(storeId, { isConnected, storeQueue, playlistId, repeat, shuffle });
    return () => removeSnapshot(storeId);
  }, [storeId, isConnected, storeQueue, playlistId, repeat, shuffle]);

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
 *
 * Ngoài việc phát nhạc qua `PlayerProvider` chung, mỗi subscriber giờ còn báo
 * cáo trạng thái của quán mình lên một external store — đọc bằng
 * `useStoresSync(storeId)` ở bất kỳ đâu trong `/dashboard/**` (vd `StoreDetail`)
 * mà không cần bọc lại cây component bằng Context.Provider.
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
