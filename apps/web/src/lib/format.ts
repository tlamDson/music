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
