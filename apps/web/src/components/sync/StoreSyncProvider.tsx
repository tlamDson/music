'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSync } from '../../hooks/useSync';
import { useClockOffset } from '../../hooks/useClockOffset';
import type { WsStoreNowPlayingPayload, StoreRepeatMode } from '@cafe-music/shared';

interface StoreSyncValue {
  isConnected: boolean;
  /** Hàng chờ đang phát của quán; null = quán chưa phát gì. */
  storeQueue: WsStoreNowPlayingPayload['queue'] | null;
  /** Playlist đang phát; null khi quán chưa phát gì hoặc chưa hydrate xong. */
  playlistId: string | null;
  /** Repeat/shuffle do server xác nhận — theo đúng `useSync`. */
  repeat: StoreRepeatMode;
  shuffle: boolean;
}

const StoreSyncContext = createContext<StoreSyncValue>({
  isConnected: false,
  storeQueue: null,
  playlistId: null,
  repeat: 'OFF',
  shuffle: false,
});

export function useStoreSync(): StoreSyncValue {
  return useContext(StoreSyncContext);
}

/**
 * Giữ socket sync sống cho **toàn bộ** subtree `/store`, không render gì.
 *
 * Trước đây `useSync` được gọi bên trong `StoreHome`, tức socket chỉ tồn tại ở
 * đúng trang `/store`. Rời sang `/store/playlists/[id]` thì cleanup của hook
 * `socket.disconnect()` chạy, browser rời room `store:<id>` — bấm phát ở đó vẫn
 * `POST /sync/stores/:id/play` thành công (201) nhưng broadcast `store-now-playing`
 * không còn ai nhận, nên `playTrack` không bao giờ được gọi và quán im lặng dù
 * toast báo "Đang phát tại quán". Mount ở layout để socket sống xuyên điều hướng,
 * giống `DashboardSyncBridge` vốn đã nằm ở layout của `/dashboard`.
 *
 * `StoreHome` đọc `isConnected`/`storeQueue` qua context thay vì tự gọi `useSync`
 * — hai socket cùng lúc sẽ khiến cả hai gọi `playTrack` cho cùng một event.
 */
export default function StoreSyncProvider({
  storeId,
  children,
}: {
  storeId: string | null;
  children: React.ReactNode;
}) {
  const [token, setToken] = useState<string | null>(null);
  const { offset, measureOffset } = useClockOffset();

  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
    void measureOffset();
  }, [measureOffset]);

  // Token null khiến `useSync` thoát sớm, không mở socket — dùng luôn cơ chế đó
  // cho tài khoản chưa được gán quán, thay vì mở socket rồi không join room nào.
  const { isConnected, storeQueue, playlistId, repeat, shuffle } = useSync({
    storeId: storeId ?? undefined,
    token: storeId ? token : null,
    clockOffset: offset,
  });

  const value = useMemo(
    () => ({ isConnected, storeQueue, playlistId, repeat, shuffle }),
    [isConnected, storeQueue, playlistId, repeat, shuffle],
  );

  return <StoreSyncContext.Provider value={value}>{children}</StoreSyncContext.Provider>;
}
