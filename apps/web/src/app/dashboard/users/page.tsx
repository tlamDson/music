'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import { useAuth } from '../../../hooks/useAuth';
import EditUserDialog from '../../../components/users/EditUserDialog';
import DeactivateUserDialog from '../../../components/users/DeactivateUserDialog';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  storeId: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Store {
  id: string;
  name: string;
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'STORE_ADMIN',
    storeId: '',
  });
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);

  const fetchData = () => {
    Promise.all([api.get<{ data: User[] }>('/users'), api.get<{ data: Store[] }>('/stores')])
      .then(([usersRes, storesRes]) => {
        setUsers(usersRes.data);
        setStores(storesRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await api.post('/users', {
        ...form,
        storeId: form.storeId || undefined,
      });
      setShowForm(false);
      setForm({ email: '', password: '', name: '', role: 'STORE_ADMIN', storeId: '' });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleReactivate = async (userId: string) => {
    try {
      await api.patch(`/users/${userId}`, { isActive: true });
      fetchData();
    } catch {
      // Bảng vẫn hiện trạng thái cũ nếu lỗi — người dùng thử lại được ngay.
    }
  };

  const handleDeactivateConfirmed = async (userId: string) => {
    try {
      await api.patch(`/users/${userId}`, { isActive: false });
      setDeactivatingUser(null);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user');
      setDeactivatingUser(null);
    }
  };

  const ROLE_COLORS: Record<string, string> = {
    ORG_ADMIN: 'rgba(67,56,202,0.8)',
    STORE_ADMIN: 'rgba(34,197,94,0.8)',
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
          >
            Users
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Manage organization members
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-90"
          style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
        >
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={(e) => void handleCreate(e)}
          className="p-6 rounded-xl flex flex-col gap-4"
          style={{ backgroundColor: 'var(--color-muted)', border: '1px solid var(--color-border)' }}
        >
          <h2 className="font-semibold" style={{ color: 'var(--color-foreground)' }}>
            New User
          </h2>

          {[
            { id: 'name', label: 'Full Name', type: 'text', key: 'name' as const },
            { id: 'email', label: 'Email', type: 'email', key: 'email' as const },
            { id: 'password', label: 'Password', type: 'password', key: 'password' as const },
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
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-border)',
                }}
                aria-label={field.label}
              />
            </div>
          ))}

          <div className="flex gap-4">
            <div className="flex flex-col gap-1 flex-1">
              <label htmlFor="role" className="text-sm" style={{ color: 'rgba(248,250,252,0.7)' }}>
                Role
              </label>
              <select
                id="role"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-border)',
                }}
                aria-label="Role"
              >
                <option value="STORE_ADMIN">STORE_ADMIN</option>
                <option value="ORG_ADMIN">ORG_ADMIN</option>
              </select>
            </div>

            {form.role === 'STORE_ADMIN' && (
              <div className="flex flex-col gap-1 flex-1">
                <label
                  htmlFor="storeId"
                  className="text-sm"
                  style={{ color: 'rgba(248,250,252,0.7)' }}
                >
                  Assign to Store
                </label>
                <select
                  id="storeId"
                  value={form.storeId}
                  onChange={(e) => setForm((f) => ({ ...f, storeId: e.target.value }))}
                  className="px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-foreground)',
                    border: '1px solid var(--color-border)',
                  }}
                  aria-label="Store"
                >
                  <option value="">— No store —</option>
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

          <button
            type="submit"
            disabled={creating}
            className="py-2 rounded-lg text-sm font-medium cursor-pointer transition-all hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? 'Creating...' : 'Create User'}
          </button>
        </form>
      )}

      {/* Users table */}
      {loading ? (
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Loading users...
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <div
                key={u.id}
                data-testid={`user-row-${u.id}`}
                className="flex items-center justify-between p-4 rounded-xl"
                style={{
                  backgroundColor: 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                  opacity: u.isActive ? 1 : 0.6,
                }}
              >
                <div>
                  <p className="font-medium" style={{ color: 'var(--color-foreground)' }}>
                    {u.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(248,250,252,0.5)' }}>
                    {u.email}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {u.storeId && (
                    <span className="text-xs" style={{ color: 'rgba(248,250,252,0.4)' }}>
                      {stores.find((s) => s.id === u.storeId)?.name ?? u.storeId.slice(0, 8)}
                    </span>
                  )}
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: ROLE_COLORS[u.role] ?? 'var(--color-muted)',
                      color: 'white',
                    }}
                  >
                    {u.role}
                  </span>
                  {!u.isActive && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: 'var(--color-destructive)', color: 'white' }}
                    >
                      Đã vô hiệu hoá
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => setEditingUser(u)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      color: 'var(--color-foreground)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    Sửa
                  </button>

                  {u.isActive ? (
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => setDeactivatingUser(u)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        color: 'var(--color-destructive)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      Vô hiệu hoá
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleReactivate(u.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-150 hover:opacity-80"
                      style={{
                        color: 'var(--color-accent)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      Kích hoạt lại
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingUser && (
        <EditUserDialog
          open
          user={editingUser}
          stores={stores}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            setEditingUser(null);
            fetchData();
          }}
        />
      )}

      {deactivatingUser && (
        <DeactivateUserDialog
          open
          user={deactivatingUser}
          storeName={stores.find((s) => s.id === deactivatingUser.storeId)?.name ?? null}
          onClose={() => setDeactivatingUser(null)}
          onConfirmed={(userId) => void handleDeactivateConfirmed(userId)}
        />
      )}
    </div>
  );
}
