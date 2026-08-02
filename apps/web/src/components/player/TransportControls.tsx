'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { usePlayer } from './PlayerProvider';
import { PlayIcon, PauseIcon, PreviousIcon, NextIcon, ShuffleIcon, RepeatIcon } from './icons';

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
  const t = useTranslations('player.transport');
  const { isPlaying, mode, storeId, queue, repeat, shuffle, toggle, togglePreviewRepeat } =
    usePlayer();

  const isStoreMode = mode === 'store' && storeId !== null;
  const disabledTitle = isStoreMode ? undefined : t('previewNoQueue');

  // Hai đầu hàng chờ thì bỏ nút hẳn, không chỉ làm mờ: bấm "Bài kế tiếp" ở bài
  // cuối từng khiến server dừng hẳn quán và thanh phát biến mất giữa lúc đang
  // nghe (QC: "tự out khỏi playlist"). `repeat: 'ALL'` biến hàng chờ thành vòng
  // tròn nên hai đầu lại đi được — nút quay lại.
  // Nghe thử (`mode: 'preview'`) không có hàng chờ: vẫn render nhưng `disabled`
  // kèm `title` giải thích, để người dùng hiểu vì sao bấm không được.
  const atQueueEdge = isStoreMode && queue !== null && repeat !== 'ALL';
  const showPrevious = !atQueueEdge || queue.index > 0;
  const showNext = !atQueueEdge || queue.remaining > 0;

  const handleShuffle = async () => {
    if (!isStoreMode || !storeId) return;
    try {
      await api.patch(`/sync/stores/${storeId}/playback-mode`, { shuffle: !shuffle });
    } catch {
      toast.error(t('shuffleFailed'));
    }
  };

  const handlePrevious = async () => {
    if (!isStoreMode || !storeId) return;
    try {
      await api.post(`/sync/stores/${storeId}/previous`);
    } catch {
      toast.error(t('previousFailed'));
    }
  };

  const handleNext = async () => {
    if (!isStoreMode || !storeId) return;
    try {
      await api.post(`/sync/stores/${storeId}/next`);
    } catch {
      toast.error(t('nextFailed'));
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
      toast.error(t('repeatFailed'));
    }
  };

  const iconSize = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
  const playIconSize = size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  const playButtonSize = size === 'lg' ? 'w-14 h-14' : 'w-9 h-9';
  const gap = size === 'lg' ? 'gap-6' : 'gap-2 md:gap-4';

  // Thanh phát trên mobile chỉ vừa chỗ cho bài trước/play/bài sau — shuffle và
  // repeat ẩn dưới `md` (mở overlay "Đang phát" thì có đủ, vì nó dùng
  // `size="lg"`). Ẩn bằng class responsive chứ không bỏ render: hai nút này vẫn
  // phải ở trong DOM cho test và cho người dùng bàn phím trên desktop hẹp.
  const modeButtonVisibility = size === 'lg' ? '' : 'hidden md:inline-flex';

  const buttonBase =
    'relative p-2 rounded-full cursor-pointer transition-opacity duration-[var(--duration-base)] hover:opacity-80 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:opacity-30';

  return (
    <div className={`flex items-center justify-center ${gap} ${className ?? ''}`}>
      <button
        onClick={() => void handleShuffle()}
        disabled={!isStoreMode}
        title={disabledTitle}
        aria-pressed={shuffle}
        aria-label={t('shuffle')}
        className={`${buttonBase} ${modeButtonVisibility}`}
        style={{ color: shuffle ? 'var(--color-accent)' : 'var(--color-foreground)' }}
      >
        <ShuffleIcon className={iconSize} />
        {shuffle && <ActiveDot />}
      </button>

      {showPrevious && (
        <button
          onClick={() => void handlePrevious()}
          disabled={!isStoreMode}
          title={disabledTitle}
          aria-label={t('previous')}
          className={buttonBase}
          style={{ color: 'var(--color-foreground)' }}
        >
          <PreviousIcon className={iconSize} />
        </button>
      )}

      <button
        onClick={toggle}
        className={`${playButtonSize} rounded-full flex items-center justify-center cursor-pointer transition-opacity duration-[var(--duration-base)] hover:opacity-90 focus-visible:outline-none`}
        style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
        aria-label={isPlaying ? t('pause') : t('play')}
      >
        {isPlaying ? <PauseIcon className={playIconSize} /> : <PlayIcon className={playIconSize} />}
      </button>

      {showNext && (
        <button
          onClick={() => void handleNext()}
          disabled={!isStoreMode}
          title={disabledTitle}
          aria-label={t('next')}
          className={buttonBase}
          style={{ color: 'var(--color-foreground)' }}
        >
          <NextIcon className={iconSize} />
        </button>
      )}

      <button
        onClick={() => void handleRepeat()}
        aria-pressed={repeat !== 'OFF'}
        aria-label={
          repeat === 'ONE' ? t('repeatOne') : repeat === 'ALL' ? t('repeatAll') : t('repeat')
        }
        className={`${buttonBase} ${modeButtonVisibility}`}
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
