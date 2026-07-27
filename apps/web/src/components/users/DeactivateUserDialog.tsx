'use client';

import { useState } from 'react';
import Dialog from '../ui/Dialog';

interface DeactivateUserDialogUser {
  id: string;
  name: string;
}

interface DeactivateUserDialogProps {
  open: boolean;
  user: DeactivateUserDialogUser;
  /** Tên quán của user, hoặc null nếu STORE_ADMIN chưa được gán vào quán nào. */
  storeName: string | null;
  onClose: () => void;
  onConfirmed: (userId: string) => void;
}

/**
 * Chưa gán quán thì không có tên quán để gõ xác nhận — fallback sang gõ tên
 * người dùng, giữ nguyên pattern "gõ để xác nhận" cho mọi trường hợp thay vì
 * bỏ qua bước xác nhận khi thiếu store.
 */
export default function DeactivateUserDialog({
  open,
  user,
  storeName,
  onClose,
  onConfirmed,
}: DeactivateUserDialogProps) {
  const [confirmText, setConfirmText] = useState('');

  const expected = storeName ?? user.name;
  const matches = confirmText.trim() === expected;

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} ariaLabel="Vô hiệu hoá tài khoản">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
        Vô hiệu hoá tài khoản
      </h2>

      <p className="text-sm" style={{ color: 'rgba(248,250,252,0.7)' }}>
        Tài khoản <strong>{user.name}</strong> sẽ không đăng nhập được nữa cho tới khi kích hoạt
        lại.
      </p>

      {storeName ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.7)' }}>
          Gõ đúng tên quán <strong>{storeName}</strong> để xác nhận.
        </p>
      ) : (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.7)' }}>
          Người dùng này chưa được gán vào quán nào — gõ tên người dùng <strong>{user.name}</strong>{' '}
          để xác nhận.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label
          htmlFor="deactivate-confirm-input"
          className="text-sm"
          style={{ color: 'rgba(248,250,252,0.7)' }}
        >
          Gõ để xác nhận
        </label>
        <input
          id="deactivate-confirm-input"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          autoComplete="off"
          className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-muted)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
        />
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={handleClose}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-80"
          style={{ color: 'var(--color-foreground)' }}
        >
          Huỷ
        </button>
        <button
          type="button"
          disabled={!matches}
          onClick={() => onConfirmed(user.id)}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-destructive)', color: 'white' }}
        >
          Vô hiệu hoá
        </button>
      </div>
    </Dialog>
  );
}
