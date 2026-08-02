'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import Dialog from '../ui/Dialog';

interface CreateStoreDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Form tạo quán — trước đây là một ô input + nút "Thêm quán" nằm ngay trên
 * danh sách, khiến người dùng tưởng ô đó dùng để tìm quán. Chuyển vào Dialog,
 * ô input trên trang giờ chỉ còn vai trò lọc.
 */
export default function CreateStoreDialog({ open, onClose, onCreated }: CreateStoreDialogProps) {
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
      await api.post('/stores', { name: name.trim() });
      toast.success(`Đã tạo quán "${name.trim()}"`);
      setName('');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Tạo quán thất bại');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} ariaLabel="Thêm quán">
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Thêm quán
        </h2>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="new-store-name"
            className="text-sm"
            style={{ color: 'var(--color-foreground-70)' }}
          >
            Tên quán
          </label>
          <input
            id="new-store-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Quán Nguyễn Huệ"
            required
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
            aria-label="Tên quán"
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
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? 'Đang tạo...' : 'Thêm quán'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
