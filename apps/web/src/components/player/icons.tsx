/**
 * Icon SVG dùng chung cho thanh phát + màn "Đang phát" toàn màn hình — tách
 * riêng để hai nơi không lặp lại cùng một bộ path (PlayerBar nhỏ, overlay to
 * hơn nhưng cùng hình dạng).
 */
interface IconProps {
  className?: string;
}

export function PlayIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
    </svg>
  );
}

export function PauseIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function NextIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M6 5.14v13.72a1 1 0 001.5.86l9-5.62V18a1 1 0 002 0V6a1 1 0 10-2 0v3.9l-9-5.62A1 1 0 006 5.14z" />
    </svg>
  );
}

export function PreviousIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18 5.14v13.72a1 1 0 01-1.5.86l-9-5.62V18a1 1 0 01-2 0V6a1 1 0 112 0v3.9l9-5.62a1 1 0 011.5.86z" />
    </svg>
  );
}

export function ShuffleIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 6h3.2a3 3 0 012.4 1.2L15 17a3 3 0 002.4 1.2H20M3 18h3.2a3 3 0 002.4-1.2l.5-.7M15 7a3 3 0 012.4-1.2H20"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.5 3.5L20.5 6l-3 2.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.5 15.5l3 2.5-3 2.5" />
    </svg>
  );
}

export function RepeatIcon({
  mode,
  className = 'w-4 h-4',
}: IconProps & { mode: 'OFF' | 'ALL' | 'ONE' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 7.5a3 3 0 013-3h10a3 3 0 013 3V10M20 16.5a3 3 0 01-3 3H7a3 3 0 01-3-3V14"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 4.5L4.5 7 7 9.5M17 19.5l2.5-2.5-2.5-2.5"
      />
      {mode === 'ONE' && (
        <text x="12" y="15.5" textAnchor="middle" fontSize="7" fill="currentColor" stroke="none">
          1
        </text>
      )}
    </svg>
  );
}

export function VolumeLoudIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5L6 9H3v6h3l5 4V5zM15.5 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"
      />
    </svg>
  );
}

export function VolumeLowIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5L6 9H3v6h3l5 4V5zM15.5 9a4 4 0 010 6"
      />
    </svg>
  );
}

export function VolumeMutedIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H3v6h3l5 4V5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 9l5 6M21 9l-5 6" />
    </svg>
  );
}

export function ExpandIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 4H5a1 1 0 00-1 1v4M15 4h4a1 1 0 011 1v4M9 20H5a1 1 0 01-1-1v-4M15 20h4a1 1 0 001-1v-4"
      />
    </svg>
  );
}

export function CloseIcon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
