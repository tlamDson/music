'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../../lib/api-client';

const FIELD_LABEL_STYLE = { color: 'var(--color-foreground-70)' };

/**
 * Đổi mật khẩu qua PATCH /me/password. Sai mật khẩu hiện tại trả 401 — đây là
 * lỗi hợp lệ của route này (không phải phiên hết hạn), api-client.ts đã loại
 * /me/password khỏi luồng tự đăng xuất trên 401 để lỗi này hiện được tại chỗ.
 */
export default function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu mới nhập lại không khớp');
      return;
    }

    setSaving(true);
    try {
      await api.patch('/me/password', { currentPassword, newPassword });
      toast.success('Đã đổi mật khẩu');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Mật khẩu hiện tại không đúng');
      } else {
        setError(err instanceof Error && err.message ? err.message : 'Đổi mật khẩu thất bại');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="p-6 rounded-xl flex flex-col gap-4"
      style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
    >
      <h2
        className="text-lg font-semibold"
        style={{ color: 'var(--color-foreground)', fontFamily: 'Fira Code, monospace' }}
      >
        Đổi mật khẩu
      </h2>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="current-password" className="text-sm" style={FIELD_LABEL_STYLE}>
            Mật khẩu hiện tại
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="new-password" className="text-sm" style={FIELD_LABEL_STYLE}>
            Mật khẩu mới
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirm-password" className="text-sm" style={FIELD_LABEL_STYLE}>
            Nhập lại mật khẩu mới
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-destructive)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto self-start px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
          style={{
            backgroundColor: 'var(--color-accent)',
            color: 'white',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Đang lưu...' : 'Đổi mật khẩu'}
        </button>
      </form>
    </section>
  );
}
