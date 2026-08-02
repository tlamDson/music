/**
 * Translator tối thiểu mà format.ts cần — khớp kiểu `values` thật của
 * `useTranslations()` bên next-intl (`Record<string, string | number | Date>`),
 * không phải `Record<string, unknown>` chung chung — nếu không TypeScript coi
 * hàm trả về từ `useTranslations()` không gán được vào `Translator`.
 */
export type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

/** mm:ss cho thời lượng bài hát; 0 hoặc thiếu dữ liệu → "--:--". */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '--:--';

  return toClock(ms);
}

/**
 * mm:ss cho vị trí đang phát. Khác `formatDuration` ở chỗ 0 là mốc hợp lệ
 * ("0:00" — vừa bắt đầu bài), không phải dữ liệu thiếu.
 */
export function formatPosition(ms: number | null | undefined): string {
  return toClock(Math.max(ms ?? 0, 0));
}

/**
 * Tổng thời lượng playlist cho card: "khoảng 7 giờ" / "45 phút" — người dùng chỉ
 * cần độ dài áng chừng, không cần từng giây. `t` phải là translator lấy từ
 * namespace `common` (đọc các key `duration.*`) — component gọi
 * `useTranslations('common')` rồi truyền thẳng xuống.
 */
export function formatTotalDuration(ms: number | null | undefined, t: Translator): string {
  if (!ms || ms <= 0) return t('duration.zeroMinutes');

  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t('duration.minutes', { minutes });

  return t('duration.aboutHours', { hours: Math.round(minutes / 60) });
}

/**
 * Tổng thời lượng đúng kiểu Spotify cho header trang chi tiết playlist: "3 giờ
 * 15 phút" — khác `formatTotalDuration` (áng chừng, dùng ở card) ở chỗ không
 * làm tròn xuống giờ, giữ luôn số phút lẻ. `t` cùng namespace `common` như trên.
 */
export function formatTotalDurationExact(ms: number | null | undefined, t: Translator): string {
  if (!ms || ms <= 0) return t('duration.zeroMinutes');

  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t('duration.minutes', { minutes });

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes === 0
    ? t('duration.hours', { hours })
    : t('duration.hoursMinutes', { hours, minutes: remainderMinutes });
}

/**
 * Ngày/tháng/năm cho cột "Ngày thêm" trong bảng track của playlist
 * (`PlaylistTrack.addedAt`). Thiếu dữ liệu hoặc chuỗi ngày không hợp lệ → "--"
 * (dấu gạch ngang không cần dịch). `locale` mặc định `'vi'` để mọi call site cũ
 * (chưa kịp truyền locale) vẫn giữ đúng hành vi hiện tại.
 */
export function formatAddedAt(iso: string | null | undefined, locale: 'vi' | 'en' = 'vi'): string {
  if (!iso) return '--';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';

  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/**
 * "{count} bài · {duration}[ · của chuỗi/của quán]" — pattern lặp lại y hệt ở
 * StoreHome/StoreDetail (có scope) và PlaylistDetail/StorePlaylistTracks
 * (không có scope). Gộp một chỗ để 4 call site không tự dịch trùng 4 lần.
 * `t` là translator namespace `common`, dùng chung với `formatTotalDurationExact`.
 */
export function formatPlaylistMeta(
  t: Translator,
  {
    count,
    durationMs,
    scope,
  }: { count: number; durationMs: number | null | undefined; scope?: 'ORG' | 'STORE' },
): string {
  const duration = formatTotalDurationExact(durationMs, t);
  const base = `${t('playlistMeta.trackCount', { count })} · ${duration}`;
  if (!scope) return base;

  const scopeLabel = t(scope === 'ORG' ? 'playlistMeta.scopeOrg' : 'playlistMeta.scopeStore');
  return `${base} · ${scopeLabel}`;
}

function toClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Đo thời lượng file audio bằng chính trình duyệt trước khi upload — backend
 * không parse audio (không thêm dependency), mà track không có durationMs thì
 * không hiện được thời lượng lẫn tự chuyển bài. Lỗi decode → 0, upload vẫn chạy.
 */
export function measureAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();

    const finish = (durationMs: number) => {
      URL.revokeObjectURL(url);
      resolve(durationMs);
    };

    audio.addEventListener('loadedmetadata', () => {
      const seconds = audio.duration;
      finish(Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0);
    });
    audio.addEventListener('error', () => finish(0));

    audio.src = url;
  });
}
