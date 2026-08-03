'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, SUPPORTED_LOCALES, type SupportedLocale } from '../../i18n/locales';

const FIELD_LABEL_STYLE = { color: 'var(--color-foreground-70)' };

/**
 * Đổi ngôn ngữ ghi cookie `NEXT_LOCALE` rồi `router.refresh()` — next-intl đọc
 * lại cookie ở `i18n/request.ts` trên request tiếp theo, các Server Component
 * (kể cả root layout) render lại với `messages` mới, đẩy xuống
 * `NextIntlClientProvider` cho toàn bộ cây con. Không cần reload cứng trang.
 */
export default function LanguageSection() {
  const t = useTranslations('settings.language');
  const currentLocale = useLocale();
  const router = useRouter();

  const handleSelect = (locale: SupportedLocale) => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000`;
    router.refresh();
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
        {t('title')}
      </h2>
      <p className="text-sm" style={FIELD_LABEL_STYLE}>
        {t('description')}
      </p>

      <div className="flex gap-3">
        {SUPPORTED_LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            aria-pressed={currentLocale === locale}
            onClick={() => handleSelect(locale)}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-opacity duration-[var(--duration-fast)] hover:opacity-90"
            style={{
              backgroundColor:
                currentLocale === locale ? 'var(--color-accent)' : 'var(--color-primary)',
              color: currentLocale === locale ? 'white' : 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            }}
          >
            {t(`options.${locale}`)}
          </button>
        ))}
      </div>
    </section>
  );
}
