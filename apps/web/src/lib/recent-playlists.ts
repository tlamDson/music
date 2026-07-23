const STORAGE_KEY = 'cafe-music:recent-playlists';
const MAX_ENTRIES = 6;

/**
 * "Gần đây" lưu ở trình duyệt: đây là thói quen của từng máy pha chế, không
 * phải dữ liệu của chuỗi — chưa đáng thêm bảng trong DB.
 */
export function readRecentPlaylists(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberRecentPlaylist(playlistId: string): string[] {
  if (typeof window === 'undefined') return [];

  const next = [playlistId, ...readRecentPlaylists().filter((id) => id !== playlistId)].slice(
    0,
    MAX_ENTRIES,
  );

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Trình duyệt chặn localStorage (chế độ riêng tư) — bỏ qua, không chặn phát nhạc
  }

  return next;
}
