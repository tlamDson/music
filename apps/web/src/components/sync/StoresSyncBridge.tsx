'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { useSync } from '../../hooks/useSync';
import { useClockOffset } from '../../hooks/useClockOffset';
import type { WsStoreNowPlayingPayload, StoreRepeatMode } from '@cafe-music/shared';

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

/** Trang chi tiết quán — `/dashboard/stores/<id>` (và mọi route con của nó). */
const STORE_DETAIL_PATH = /^\/dashboard\/stores\/([^/]+)/;

/**
 * Quán mà tab dashboard đang "mở", tức quán duy nhất được phép phát ra thẻ audio
 * dùng chung. Danh sách `/dashboard/stores` (không có id) và mọi trang khác đều
 * trả `null` — dashboard ở đó chỉ xem trạng thái, không phát tiếng.
 */
export function focusedStoreIdFrom(pathname: string | null): string | null {
  return pathname?.match(STORE_DETAIL_PATH)?.[1] ?? null;
}

/** Không render gì — chỉ mở một socket sync cho một quán cụ thể, và báo cáo
 * trạng thái của nó lên external store theo đúng `storeId`. Tách riêng khỏi
 * `StoresSyncBridge` để `storeId` đổi là cả subscriber remount (qua `key`), nhờ
 * đó `useSync` chạy cleanup dừng nhạc của quán cũ trước khi nghe quán mới. */
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
 * Không render gì — mở socket sync cho **đúng một quán**: quán mà tab dashboard
 * đang mở (`/dashboard/stores/<id>`). Admin bấm phát ở đó thì tự nghe được bài
 * đang chạy, và trạng thái quán lên external store để `StoreDetail` đọc qua
 * `useStoresSync(storeId)` mà không phải chờ lần poll 10 giây kế tiếp.
 *
 * **Trước đây mở một socket cho MỌI quán của tổ chức** (fetch `GET /stores`) và
 * tất cả đổ vào cùng một `PlayerProvider` — cả app chỉ có một thẻ audio, nên
 * quán nào bắn `store-now-playing` cũng cướp được nó: một store admin đổi bài ở
 * quán mình làm tab org admin nhảy sang bài đó (bug QC). Tệ hơn, nút "Bài kế
 * tiếp" trên thanh phát bắn vào `usePlayer().storeId` = quán vừa bắn event gần
 * nhất, nên org admin đang xem quán A có thể đổi bài thật của quán C. Việc thu về
 * một socket cũng hết làm phồng `SyncGateway.countStoreClients` (mỗi tab
 * dashboard từng cộng +1 "màn hình đang kết nối" cho mọi quán).
 *
 * Đổi lại: ở các trang dashboard khác (tổng quan, playlist, kho nhạc) tab admin
 * không phát tiếng — đúng như rule "chỉ `/dashboard/stores/[id]` mới phát ra loa
 * quán".
 */
export default function StoresSyncBridge() {
  const pathname = usePathname();
  const [token, setToken] = useState<string | null>(null);
  const { offset, measureOffset } = useClockOffset();

  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
    void measureOffset();
  }, [measureOffset]);

  const focusedStoreId = focusedStoreIdFrom(pathname);
  if (!focusedStoreId) return null;

  return (
    <StoreSyncSubscriber
      key={focusedStoreId}
      storeId={focusedStoreId}
      token={token}
      clockOffset={offset}
    />
  );
}
