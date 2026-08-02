import type { ReactNode } from 'react';
import viMessages from '../messages/vi.json';

type Messages = Record<string, unknown>;

function getNested(obj: Messages, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Messages)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, values?: Record<string, unknown>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function useTranslations(namespace?: string) {
  return (key: string, values?: Record<string, unknown>) => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    const template = getNested(viMessages, fullKey);
    if (typeof template !== 'string') return fullKey;
    return interpolate(template, values);
  };
}

export function useLocale() {
  return 'vi';
}

export function useMessages() {
  return viMessages;
}

export function NextIntlClientProvider({ children }: { children: ReactNode }) {
  return children;
}
