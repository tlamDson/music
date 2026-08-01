'use client';

import { useAuth } from '../../hooks/useAuth';
import StoreHome from '../../components/store/StoreHome';

export default function StorePage() {
  const { user } = useAuth();

  if (!user) return null;

  if (!user.storeId) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-destructive)' }}>
        Tài khoản của bạn chưa được gắn với quán nào — nhờ quản trị chuỗi gán giúp.
      </p>
    );
  }

  return <StoreHome storeId={user.storeId} />;
}
