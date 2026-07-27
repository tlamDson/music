'use client';

import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { usePlayer } from './PlayerProvider';
import { PlayIcon, PauseIcon, PreviousIcon, NextIcon, ShuffleIcon, RepeatIcon } from './icons';

const PREVIEW_NO_QUEUE_TITLE = 'Đang nghe thử một bài, không có hàng chờ để chuyển';

/**
 * Cụm shuffle · bài trước · play/pause · bài sau · repeat — dùng chung cho
 * `PlayerBar` (nhỏ) và `NowPlayingOverlay` (to). Cả hai nơi phải hành xử giống
 * hệt nhau nên logic gọi API/đổi trạng thái chỉ viết một chỗ.
 *
 * Repeat/shuffle đọc thẳng từ `usePlayer()` — trạng thái do server xác nhận
 * qua `useSync`/`StoreSyncProvider`, không giữ state cục bộ ở đây. Quán mở hai
 * màn hình vẫn thấy đúng một trạng thái vì cả hai đều đọc từ cùng một nguồn.
 */
export default function TransportControls({
  size = 'sm',
  className,
}: {
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const { isPlaying, mode, storeId, repeat, shuffle, toggle, togglePreviewRepeat } = usePlayer();

  const isStoreMode = mode === 'store' && storeId !== null;
  const disabledTitle = isStoreMode ? undefined : PREVIEW_NO_QUEUE_TITLE;

  const handleShuffle = async () => {
    if (!isStoreMode || !storeId) return;
    try {
      await api.patch(`/sync/stores/${storeId}/playback-mode`, { shuffle: !shuffle });
    } catch {
      toast.error('Không đổi được chế độ trộn bài');
    }
  };

  const handlePrevious = async () => {
    if (!isStoreMode || !storeId) return;
    try {
      await api.post(`/sync/stores/${storeId}/previous`);
    } catch {
      toast.error('Không quay lại được bài trước');
    }
  };

  const handleNext = async () => {
    if (!isStoreMode || !storeId) return;
    try {
      await api.post(`/sync/stores/${storeId}/next`);
    } catch {
      toast.error('Không chuyển được bài');
    }
  };

  const handleRepeat = async () => {
    if (!isStoreMode) {
      togglePreviewRepeat();
      return;
    }
    if (!storeId) return;

    const next = repeat === 'OFF' ? 'ALL' : repeat === 'ALL' ? 'ONE' : 'OFF';
    try {
      await api.patch(`/sync/stores/${storeId}/playback-mode`, { repeat: next });
    } catch {
      toast.error('Không đổi được chế độ lặp lại');
    }
  };

  const iconSize = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
  const playIconSize = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  const playButtonSize = size === 'lg' ? 'w-14 h-14' : 'w-9 h-9';
  const gap = size === 'lg' ? 'gap-6' : 'gap-4';

  const buttonBase =
    'relative p-2 rounded-full cursor-pointer transition-all duration-200 hover:opacity-80 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:opacity-30';

  return (
    <div className={`flex items-center justify-center ${gap} ${className ?? ''}`}>
      <button
        onClick={() => void handleShuffle()}
        disabled={!isStoreMode}
        title={disabledTitle}
        aria-pressed={shuffle}
        aria-label="Phát ngẫu nhiên"
        className={buttonBase}
        style={{ color: shuffle ? 'var(--color-accent)' : 'var(--color-foreground)' }}
      >
        <ShuffleIcon className={iconSize} />
        {shuffle && <ActiveDot />}
      </button>

      <button
        onClick={() => void handlePrevious()}
        disabled={!isStoreMode}
        title={disabledTitle}
        aria-label="Bài trước"
        className={buttonBase}
        style={{ color: 'var(--color-foreground)' }}
      >
        <PreviousIcon className={iconSize} />
      </button>

      <button
        onClick={toggle}
        className={`${playButtonSize} rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:opacity-90 focus-visible:outline-none`}
        style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
        aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
      >
        {isPlaying ? <PauseIcon className={playIconSize} /> : <PlayIcon className={playIconSize} />}
      </button>

      <button
        onClick={() => void handleNext()}
        disabled={!isStoreMode}
        title={disabledTitle}
        aria-label="Bài kế tiếp"
        className={buttonBase}
        style={{ color: 'var(--color-foreground)' }}
      >
        <NextIcon className={iconSize} />
      </button>

      <button
        onClick={() => void handleRepeat()}
        aria-pressed={repeat !== 'OFF'}
        aria-label={
          repeat === 'ONE' ? 'Lặp lại một bài' : repeat === 'ALL' ? 'Lặp lại danh sách' : 'Lặp lại'
        }
        className={buttonBase}
        style={{ color: repeat !== 'OFF' ? 'var(--color-accent)' : 'var(--color-foreground)' }}
      >
        <RepeatIcon mode={repeat} className={iconSize} />
        {repeat !== 'OFF' && <ActiveDot />}
      </button>
    </div>
  );
}

/** Chấm nhỏ dưới chân nút đang bật — ngôn ngữ Spotify cho shuffle/repeat. */
function ActiveDot() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-1/2 bottom-0.5 -translate-x-1/2 w-1 h-1 rounded-full"
      style={{ backgroundColor: 'var(--color-accent)' }}
    />
  );
}
