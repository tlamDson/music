import { useEffect, useState } from 'react';
import type { ViewMode } from '../components/ui/ViewToggle';

const STORAGE_PREFIX = 'cafe-music:view:';

/**
 * Nhớ lựa chọn danh sách/lưới theo từng trang (`key`) trong localStorage.
 * Đọc trong `useEffect`, không đọc lúc render — SSR không có `localStorage`,
 * đọc lúc render sẽ lệch hydration (xem `lib/recent-playlists.ts`).
 */
export function useViewMode(key: string, fallback: ViewMode): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(fallback);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw === 'list' || raw === 'grid') setMode(raw);
    } catch {
      // Trình duyệt chặn localStorage (chế độ riêng tư) — giữ mặc định
    }
  }, [key]);

  const update = (next: ViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, next);
    } catch {
      // Bỏ qua — lựa chọn chỉ không được nhớ, không chặn thao tác
    }
  };

  return [mode, update];
}
