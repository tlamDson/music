/**
 * Hằng số locale dùng chung — tách riêng khỏi `request.ts` vì file đó import
 * `next/headers` + `next-intl/server` (server-only). `LanguageSection.tsx` là
 * Client Component, import thẳng `request.ts` sẽ kéo theo chuỗi import
 * server-only vào bundle client (và làm Jest vỡ vì gặp cú pháp ESM chưa transform).
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE';
export const DEFAULT_LOCALE = 'vi';
export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function isSupportedLocale(value: string | undefined): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}
