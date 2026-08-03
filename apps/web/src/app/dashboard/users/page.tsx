'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api-client';
import { useAuth } from '../../../hooks/useAuth';
import CreateUserDialog from '../../../components/users/CreateUserDialog';
import EditUserDialog from '../../../components/users/EditUserDialog';
import DeactivateUserDialog from '../../../components/users/DeactivateUserDialog';
import { ROLE_COLORS, roleLabel } from '../../../lib/roles';

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

// Dùng chung cho cả hai nút hàng để chúng luôn cao bằng nhau trên mobile:
// `whitespace-nowrap` chặn chữ "Vô hiệu hoá" xuống dòng, `min-h-9` giữ chiều
// cao cố định kể cả khi disabled, `flex-1` chia đều bề ngang ở màn hẹp.
const ROW_ACTION_CLASS =
  'flex-1 sm:flex-none min-h-9 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40';

export default function UsersPage() {
  const t = useTranslations('dashboard.users');
  const tCommon = useTranslations('common');
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
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
      setError(err instanceof Error ? err.message : t('deactivateFailed'));
      setDeactivatingUser(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
          >
            {t('title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-foreground-50)' }}>
            {t('subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--color-accent)', color: 'white' }}
        >
          {t('addUser')}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-destructive)' }}>
          {error}
        </p>
      )}

      {/* Danh sách người dùng */}
      {loading ? (
        <div className="flex flex-col gap-2" role="status" aria-label={t('loadingUsersLabel')}>
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
          <span className="sr-only">{t('loadingUsersText')}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => {
            const isSelf = u.id === currentUser?.id;
            return (
              <div
                key={u.id}
                data-testid={`user-row-${u.id}`}
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl"
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
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-foreground-50)' }}>
                    {u.email}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {u.storeId && (
                    <span className="text-xs" style={{ color: 'var(--color-foreground-40)' }}>
                      {stores.find((s) => s.id === u.storeId)?.name ?? u.storeId.slice(0, 8)}
                    </span>
                  )}
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                    style={{
                      backgroundColor: ROLE_COLORS[u.role] ?? 'var(--color-muted)',
                      color: 'white',
                    }}
                  >
                    {roleLabel(u.role, tCommon)}
                  </span>
                  {!u.isActive && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                      style={{ backgroundColor: 'var(--color-destructive)', color: 'white' }}
                    >
                      {t('deactivatedBadge')}
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => setEditingUser(u)}
                    className={ROW_ACTION_CLASS}
                    style={{
                      color: 'var(--color-foreground)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    {t('edit')}
                  </button>

                  {u.isActive ? (
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => setDeactivatingUser(u)}
                      className={ROW_ACTION_CLASS}
                      style={{
                        color: 'var(--color-destructive)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {t('deactivate')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleReactivate(u.id)}
                      className={ROW_ACTION_CLASS}
                      style={{
                        color: 'var(--color-accent)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {t('reactivate')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateUserDialog
        open={showCreateDialog}
        stores={stores}
        onClose={() => setShowCreateDialog(false)}
        onCreated={() => {
          setShowCreateDialog(false);
          fetchData();
        }}
      />

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
