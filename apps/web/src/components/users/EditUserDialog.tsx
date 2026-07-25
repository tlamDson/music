'use client';

import { useState } from 'react';
import { api } from '../../lib/api-client';
import Dialog from '../ui/Dialog';

interface EditUserDialogUser {
  id: string;
  name: string;
  role: string;
  storeId: string | null;
}

interface Store {
  id: string;
  name: string;
}

interface EditUserDialogProps {
  open: boolean;
  user: EditUserDialogUser;
  stores: Store[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Không sửa email/password ở đây — endpoint PATCH /users/:id chỉ nhận
 * name/role/storeId/isActive, đổi thông tin đăng nhập cần luồng riêng.
 */
export default function EditUserDialog({
  open,
  user,
  stores,
  onClose,
  onSaved,
}: EditUserDialogProps) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [storeId, setStoreId] = useState(user.storeId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, {
        name,
        role,
        storeId: role === 'STORE_ADMIN' ? storeId || null : null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Sửa người dùng">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Sửa người dùng
        </h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="edit-name" className="text-sm" style={{ color: 'rgba(248,250,252,0.7)' }}>
            Họ tên
          </label>
          <input
            id="edit-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>

        <div className="flex gap-4">
          <div className="flex flex-col gap-1 flex-1">
            <label
              htmlFor="edit-role"
              className="text-sm"
              style={{ color: 'rgba(248,250,252,0.7)' }}
            >
              Vai trò
            </label>
            <select
              id="edit-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
              style={{
                backgroundColor: 'var(--color-muted)',
                color: 'var(--color-foreground)',
                border: '1px solid var(--color-border)',
              }}
            >
              <option value="STORE_ADMIN">STORE_ADMIN</option>
              <option value="ORG_ADMIN">ORG_ADMIN</option>
            </select>
          </div>

          {role === 'STORE_ADMIN' && (
            <div className="flex flex-col gap-1 flex-1">
              <label
                htmlFor="edit-store"
                className="text-sm"
                style={{ color: 'rgba(248,250,252,0.7)' }}
              >
                Quán
              </label>
              <select
                id="edit-store"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-muted)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-border)',
                }}
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
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-80"
            style={{ color: 'var(--color-foreground)' }}
          >
            Huỷ
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
