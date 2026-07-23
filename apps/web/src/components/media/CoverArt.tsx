'use client';

/**
 * DB chưa có ảnh bìa cho track/playlist. Thay vì để ô xám trống, sinh bìa từ id
 * — cùng id luôn ra cùng màu — bằng đúng palette của design system (indigo →
 * xanh accent), tránh gradient tím/hồng kiểu AI đã liệt vào anti-pattern.
 */
const PALETTE: Array<[string, string]> = [
  ['#1E1B4B', '#4338CA'],
  ['#4338CA', '#22C55E'],
  ['#27273B', '#4338CA'],
  ['#1E1B4B', '#22C55E'],
  ['#312E81', '#4338CA'],
];

function hashOf(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

interface CoverArtProps {
  seed: string;
  label: string;
  size?: number;
  className?: string;
}

export default function CoverArt({ seed, label, size = 40, className }: CoverArtProps) {
  const [from, to] = PALETTE[hashOf(seed) % PALETTE.length];

  return (
    <div
      className={`flex items-center justify-center rounded flex-shrink-0 ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      }}
      aria-hidden="true"
    >
      <span
        className="font-semibold"
        style={{ color: 'rgba(248,250,252,0.9)', fontSize: Math.max(11, size / 3) }}
      >
        {label.slice(0, 1).toUpperCase()}
      </span>
    </div>
  );
}
