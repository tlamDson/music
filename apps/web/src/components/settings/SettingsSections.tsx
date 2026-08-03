'use client';

import { useTranslations } from 'next-intl';
import ProfileSection from './ProfileSection';
import PasswordSection from './PasswordSection';
import LanguageSection from './LanguageSection';

/**
 * Khung trang Cài đặt dùng chung cho `/dashboard/settings` và
 * `/store/settings` — mọi vai trò đăng nhập đều gọi được `/me`, nên không cần
 * tham số vai trò.
 */
export default function SettingsSections() {
  const t = useTranslations('settings');

  return (
    <div className="flex flex-col gap-8">
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

      <ProfileSection />
      <PasswordSection />
      <LanguageSection />
    </div>
  );
}
