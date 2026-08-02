'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api-client';
import { roleLabel } from '../../lib/roles';

interface Profile {
  id: string;
  email: string;
  name: string;
  role: string;
  storeId: string | null;
  isActive: boolean;
  createdAt: string;
  store?: { name: string } | null;
}

const FIELD_LABEL_STYLE = { color: 'rgba(248,250,252,0.7)' };
const MUTED_TEXT_STYLE = { color: 'rgba(248,250,252,0.5)' };

/** Sửa Họ tên (PATCH /me); Email/Vai trò/Quán chỉ đọc — chỉ ORG_ADMIN đổi được qua trang Người dùng. */
export default function ProfileSection() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Profile>('/me')
      .then((data) => {
        setProfile(data);
        setName(data.name);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const updated = await api.patch<Profile>('/me', { name: name.trim() });
      setProfile((prev) => (prev ? { ...prev, name: updated.name } : prev));
      toast.success('Đã lưu thông tin tài khoản');
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : 'Lưu thông tin thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section
        className="p-6 rounded-xl flex flex-col gap-4"
        style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
        aria-label="Đang tải thông tin tài khoản"
      >
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-10 w-full" />
      </section>
    );
  }

  if (!profile) return null;

  return (
    <section
      className="p-6 rounded-xl flex flex-col gap-4"
      style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
    >
      <h2
        className="text-lg font-semibold"
        style={{ color: 'var(--color-foreground)', fontFamily: 'Fira Code, monospace' }}
      >
        Thông tin tài khoản
      </h2>

      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="profile-name" className="text-sm" style={FIELD_LABEL_STYLE}>
            Họ tên
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm" style={FIELD_LABEL_STYLE}>
              Email
            </span>
            <p style={{ color: 'var(--color-foreground)' }}>{profile.email}</p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm" style={FIELD_LABEL_STYLE}>
              Vai trò
            </span>
            <p style={{ color: 'var(--color-foreground)' }}>{roleLabel(profile.role)}</p>
          </div>
          {profile.store && (
            <div className="flex flex-col gap-1">
              <span className="text-sm" style={FIELD_LABEL_STYLE}>
                Quán
              </span>
              <p style={{ color: 'var(--color-foreground)' }}>{profile.store.name}</p>
            </div>
          )}
        </div>

        <p className="text-xs" style={MUTED_TEXT_STYLE}>
          Email, vai trò và quán chỉ quản lý chuỗi mới đổi được, ở trang Người dùng.
        </p>

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
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </form>
    </section>
  );
}
