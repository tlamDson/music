'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import Dialog from '../ui/Dialog';

interface CreatePlaylistDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

/**
 * Form tạo playlist — trước đây là một ô input + nút "Tạo playlist" nằm ngay
 * dưới chip lọc/ô tìm kiếm, khiến trang có hai vai trò lẫn lộn (lọc + tạo).
 * Logic scope (ORG/STORE, storeId) ở lại `PlaylistBrowse` — dialog chỉ hỏi tên.
 */
export default function CreatePlaylistDialog({
  open,
  onClose,
  onCreate,
}: CreatePlaylistDialogProps) {
  const t = useTranslations('playlist.createDialog');
  const tCommon = useTranslations('common');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleClose = () => {
    setName('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    try {
      await onCreate(name.trim());
      setName('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} ariaLabel={t('title')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          {t('title')}
        </h2>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="new-playlist-name"
            className="text-sm"
            style={{ color: 'var(--color-foreground-70)' }}
          >
            {t('nameLabel')}
          </label>
          <input
            id="new-playlist-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            required
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
            aria-label={t('nameLabel')}
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
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? t('creating') : t('title')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
