'use client';

import { useEffect, useRef } from 'react';
import { usePlayer } from './PlayerProvider';
import { VolumeLoudIcon, VolumeLowIcon, VolumeMutedIcon } from './icons';

const MUTED_TEXT = 'var(--color-foreground-60)';

/**
 * Nút loa giờ bấm được (trước đây chỉ là hình trang trí): tắt/bật tiếng, nhớ
 * lại mức âm lượng cũ để bật lại đúng chỗ đã tắt thay vì nhảy về 100%.
 */
/**
 * `className` phải mang luôn class `display` (mặc định `flex`) — `PlayerBar`
 * truyền `hidden md:flex` để ẩn cụm âm lượng trên mobile, mà `hidden` chỉ thắng
 * nếu ở đây không có `flex` cứng đè lại.
 */
export default function VolumeControl({ className = 'flex' }: { className?: string }) {
  const { volume, changeVolume } = usePlayer();
  const previousVolumeRef = useRef(volume > 0 ? volume : 1);

  // Theo dõi mức âm lượng không-tắt gần nhất kể cả khi người dùng kéo thanh
  // trượt trực tiếp về gần 0 (không chỉ qua nút tắt tiếng).
  useEffect(() => {
    if (volume > 0) previousVolumeRef.current = volume;
  }, [volume]);

  const isMuted = volume <= 0;
  const Icon = isMuted ? VolumeMutedIcon : volume <= 0.5 ? VolumeLowIcon : VolumeLoudIcon;

  const handleToggleMute = () => {
    if (isMuted) {
      changeVolume(previousVolumeRef.current || 1);
    } else {
      changeVolume(0);
    }
  };

  return (
    <div className={`items-center gap-2 ${className}`} style={{ color: MUTED_TEXT }}>
      <button
        onClick={handleToggleMute}
        aria-pressed={isMuted}
        aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
        className="p-1 rounded-full cursor-pointer transition-opacity duration-[var(--duration-base)] hover:opacity-80 focus-visible:outline-none"
      >
        <Icon />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => changeVolume(Number(e.target.value))}
        className="w-20 h-1 cursor-pointer accent-[var(--color-accent)]"
        aria-label="Âm lượng"
      />
    </div>
  );
}
