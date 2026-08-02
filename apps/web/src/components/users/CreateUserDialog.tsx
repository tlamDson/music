'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '../../lib/api-client';
import Dialog from '../ui/Dialog';

interface Store {
  id: string;
  name: string;
}

interface CreateUserDialogProps {
  open: boolean;
  stores: Store[];
  onClose: () => void;
  onCreated: () => void;
}

const emptyForm = {
  email: '',
  password: '',
  name: '',
  role: 'STORE_ADMIN',
  storeId: '',
};

/**
 * Form tạo user — trước đây là panel bung ra inline ngay trên trang
 * `/dashboard/users`, chuyển vào `Dialog` dùng chung cho đồng bộ với các
 * trang Quán/Playlist (QC iPhone: form dài đẩy danh sách xuống thấp trên
 * màn hình nhỏ).
 */
export default function CreateUserDialog({
  open,
  stores,
  onClose,
  onCreated,
}: CreateUserDialogProps) {
  const t = useTranslations('dashboard.users');
  const tCommon = useTranslations('common');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setForm(emptyForm);
    setError('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await api.post('/users', {
        ...form,
        storeId: form.storeId || undefined,
      });
      setForm(emptyForm);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createDialog.failed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} ariaLabel={t('createDialog.title')}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          {t('createDialog.title')}
        </h2>

        {[
          { id: 'create-name', label: t('fields.fullName'), type: 'text', key: 'name' as const },
          { id: 'create-email', label: t('fields.email'), type: 'email', key: 'email' as const },
          {
            id: 'create-password',
            label: t('fields.password'),
            type: 'password',
            key: 'password' as const,
          },
        ].map((field) => (
          <div key={field.id} className="flex flex-col gap-1">
            <label
              htmlFor={field.id}
              className="text-sm"
              style={{ color: 'var(--color-foreground-70)' }}
            >
              {field.label}
            </label>
            <input
              id={field.id}
              type={field.type}
              value={form[field.key]}
              onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              required
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-muted)',
                color: 'var(--color-foreground)',
                border: '1px solid var(--color-border)',
              }}
              aria-label={field.label}
            />
          </div>
        ))}

        <div className="flex gap-4">
          <div className="flex flex-col gap-1 flex-1">
            <label
              htmlFor="create-role"
              className="text-sm"
              style={{ color: 'var(--color-foreground-70)' }}
            >
              {t('fields.role')}
            </label>
            <select
              id="create-role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
              style={{
                backgroundColor: 'var(--color-muted)',
                color: 'var(--color-foreground)',
                border: '1px solid var(--color-border)',
              }}
              aria-label={t('fields.role')}
            >
              <option value="STORE_ADMIN">{tCommon('roles.storeAdmin')}</option>
              <option value="ORG_ADMIN">{tCommon('roles.orgAdmin')}</option>
            </select>
          </div>

          {form.role === 'STORE_ADMIN' && (
            <div className="flex flex-col gap-1 flex-1">
              <label
                htmlFor="create-store"
                className="text-sm"
                style={{ color: 'var(--color-foreground-70)' }}
              >
                {t('createDialog.assignStoreLabel')}
              </label>
              <select
                id="create-store"
                value={form.storeId}
                onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-muted)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-border)',
                }}
                aria-label={t('fields.store')}
              >
                <option value="">{t('noStoreOption')}</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-destructive)' }}>
            {error}
          </p>
        )}

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
            {creating ? t('createDialog.creating') : t('createDialog.submit')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
