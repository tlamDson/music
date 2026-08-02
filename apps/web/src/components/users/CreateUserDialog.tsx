'use client';

import { useState } from 'react';
import { api } from '../../lib/api-client';
import Dialog from '../ui/Dialog';
import { ROLE_LABELS } from '../../lib/roles';

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
      setError(err instanceof Error ? err.message : 'Tạo người dùng thất bại');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} ariaLabel="Thêm người dùng">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Thêm người dùng
        </h2>

        {[
          { id: 'create-name', label: 'Họ tên', type: 'text', key: 'name' as const },
          { id: 'create-email', label: 'Email', type: 'email', key: 'email' as const },
          { id: 'create-password', label: 'Mật khẩu', type: 'password', key: 'password' as const },
        ].map((field) => (
          <div key={field.id} className="flex flex-col gap-1">
            <label
              htmlFor={field.id}
              className="text-sm"
              style={{ color: 'rgba(248,250,252,0.7)' }}
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
              style={{ color: 'rgba(248,250,252,0.7)' }}
            >
              Vai trò
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
              aria-label="Vai trò"
            >
              <option value="STORE_ADMIN">{ROLE_LABELS.STORE_ADMIN}</option>
              <option value="ORG_ADMIN">{ROLE_LABELS.ORG_ADMIN}</option>
            </select>
          </div>

          {form.role === 'STORE_ADMIN' && (
            <div className="flex flex-col gap-1 flex-1">
              <label
                htmlFor="create-store"
                className="text-sm"
                style={{ color: 'rgba(248,250,252,0.7)' }}
              >
                Gán vào quán
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
                aria-label="Quán"
              >
                <option value="">— Chưa gán quán —</option>
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
            Huỷ
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
            {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
