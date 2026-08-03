'use client';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations('dashboard.users');
  const tCommon = useTranslations('common');
  const [confirmText, setConfirmText] = useState('');

  const expected = storeName ?? user.name;
  const matches = confirmText.trim() === expected;

  const handleClose = () => {
    setConfirmText('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} ariaLabel={t('deactivateDialog.title')}>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
        {t('deactivateDialog.title')}
      </h2>

      <p className="text-sm" style={{ color: 'var(--color-foreground-70)' }}>
        {t('deactivateDialog.warningPrefix')} <strong>{user.name}</strong>{' '}
        {t('deactivateDialog.warningSuffix')}
      </p>

      {storeName ? (
        <p className="text-sm" style={{ color: 'var(--color-foreground-70)' }}>
          {t('deactivateDialog.typeStorePrefix')} <strong>{storeName}</strong>{' '}
          {t('deactivateDialog.typeSuffix')}
        </p>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-foreground-70)' }}>
          {t('deactivateDialog.typeUserFallbackPrefix')} <strong>{user.name}</strong>{' '}
          {t('deactivateDialog.typeSuffix')}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label
          htmlFor="deactivate-confirm-input"
          className="text-sm"
          style={{ color: 'var(--color-foreground-70)' }}
        >
          {t('deactivateDialog.confirmLabel')}
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
          {tCommon('cancel')}
        </button>
        <button
          type="button"
          disabled={!matches}
          onClick={() => onConfirmed(user.id)}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-destructive)', color: 'white' }}
        >
          {t('deactivate')}
        </button>
      </div>
    </Dialog>
  );
}
