'use client';

import { useEffect, useState } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}

const EXIT_ANIMATION_MS = 180;

/**
 * Set thành biến CSS `--dialog-exit-ms` trên overlay/panel để globals.css
 * (`.dialog-overlay` / `.dialog-panel`) đọc đúng thời lượng animation exit
 * từ hằng số JS này — một nguồn duy nhất, đổi `EXIT_ANIMATION_MS` là cả
 * `setTimeout` unmount lẫn CSS transition đổi theo, không phải sửa hai nơi.
 */
const exitDurationVar = { '--dialog-exit-ms': `${EXIT_ANIMATION_MS}ms` } as React.CSSProperties;

/**
 * Overlay + panel dùng chung cho mọi modal trong app. Giữ `rendered` true
 * thêm một nhịp sau khi `open` tắt để animation exit (xem globals.css
 * `.dialog-panel[data-state]`) có thời gian chạy trước khi unmount hẳn —
 * nếu unmount ngay theo `open` thì modal biến mất tức thời, không animate được.
 */
export default function Dialog({ open, onClose, ariaLabel, children }: DialogProps) {
  const [rendered, setRendered] = useState(open);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return;
    }
    const timer = setTimeout(() => setRendered(false), EXIT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!rendered) return null;

  const state = open ? 'open' : 'closed';

  return (
    <div
      data-testid="dialog-backdrop"
      data-state={state}
      onClick={onClose}
      className="dialog-overlay fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center p-4"
      style={{
        ...exitDurationVar,
        backgroundColor: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-state={state}
        onClick={(e) => e.stopPropagation()}
        className="dialog-panel w-full max-w-lg max-h-[80vh] flex flex-col gap-4 p-6 rounded-2xl"
        style={{
          ...exitDurationVar,
          backgroundColor: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
