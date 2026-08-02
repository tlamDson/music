'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '../../hooks/useAuth';
import StoreHome from '../../components/store/StoreHome';

export default function StorePage() {
  const t = useTranslations('store.homePage');
  const { user } = useAuth();

  if (!user) return null;

  if (!user.storeId) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-destructive)' }}>
        {t('noStoreAssigned')}
      </p>
    );
  }

  return <StoreHome storeId={user.storeId} />;
}
