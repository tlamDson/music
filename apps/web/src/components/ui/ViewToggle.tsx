'use client';

import { useTranslations } from 'next-intl';

export type ViewMode = 'list' | 'grid';

interface ViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const BUTTON_CLASS =
  'p-2 rounded-md cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none';

/**
 * Chuyển đổi giữa dạng danh sách và dạng lưới — chỗ duy nhất làm toggle này,
 * dùng chung cho trang Quán và Playlist. Lựa chọn ghi vào localStorage qua
 * `useViewMode`, không tự lưu ở đây.
 */
export default function ViewToggle({ value, onChange }: ViewToggleProps) {
  const t = useTranslations('common.viewToggle');

  return (
    <div
      className="flex items-center gap-1 rounded-lg p-1"
      style={{ border: '1px solid var(--color-border)' }}
      role="group"
      aria-label={t('groupLabel')}
    >
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={value === 'list'}
        aria-label={t('listView')}
        className={BUTTON_CLASS}
        style={{
          backgroundColor: value === 'list' ? 'var(--color-accent)' : 'transparent',
          color: value === 'list' ? 'white' : 'var(--color-foreground)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onChange('grid')}
        aria-pressed={value === 'grid'}
        aria-label={t('gridView')}
        className={BUTTON_CLASS}
        style={{
          backgroundColor: value === 'grid' ? 'var(--color-accent)' : 'transparent',
          color: value === 'grid' ? 'white' : 'var(--color-foreground)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
      </button>
    </div>
  );
}
