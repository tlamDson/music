'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import Dialog from '../ui/Dialog';

interface TrackMetaDialogProps {
  open: boolean;
  mode: 'upload' | 'edit';
  defaultTitle: string;
  defaultArtist: string;
  saving: boolean;
  onSubmit: (values: { title: string; artist: string }) => void;
  onClose: () => void;
}

/**
 * Dialog dùng chung cho cả lúc upload (điền tên bài + ca sĩ trước khi gửi
 * file) lẫn sửa lại sau (PATCH /tracks/:id) — hai luồng chỉ khác tiêu đề và
 * nhãn nút submit.
 */
export default function TrackMetaDialog({
  open,
  mode,
  defaultTitle,
  defaultArtist,
  saving,
  onSubmit,
  onClose,
}: TrackMetaDialogProps) {
  const t = useTranslations('track.metaDialog');
  const tCommon = useTranslations('common');
  const [title, setTitle] = useState(defaultTitle);
  const [artist, setArtist] = useState(defaultArtist);

  // Mở dialog cho một bài khác (hoặc file khác) phải nạp lại giá trị mặc định.
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setArtist(defaultArtist);
    }
  }, [open, defaultTitle, defaultArtist]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), artist: artist.trim() });
  };

  const heading = mode === 'upload' ? t('uploadTitle') : t('editTitle');
  const submitLabel = mode === 'upload' ? t('uploadSubmit') : t('editSubmit');
  const savingLabel = mode === 'upload' ? t('uploading') : t('saving');

  return (
    <Dialog open={open} onClose={onClose} ariaLabel={heading}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          {heading}
        </h2>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="track-meta-title"
            className="text-sm"
            style={{ color: 'var(--color-foreground-70)' }}
          >
            {t('titleLabel')}
          </label>
          <input
            id="track-meta-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
            aria-label={t('titleLabel')}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="track-meta-artist"
            className="text-sm"
            style={{ color: 'var(--color-foreground-70)' }}
          >
            {t('artistLabel')}
          </label>
          <input
            id="track-meta-artist"
            type="text"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder={t('artistPlaceholder')}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
            aria-label={t('artistLabel')}
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-80"
            style={{ color: 'var(--color-foreground)' }}
          >
            {tCommon('cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? savingLabel : submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
