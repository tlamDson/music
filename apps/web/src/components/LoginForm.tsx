'use client';

import { useTranslations } from 'next-intl';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { homePathFor } from '../lib/nav';
import type { UserRole } from '@cafe-music/shared';

export default function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login({ email, password });
      router.push(user ? homePathFor(user.role as UserRole) : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      aria-label={t('login')}
      role="form"
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label
          htmlFor="email"
          className="text-sm font-medium"
          style={{ color: 'var(--color-foreground)' }}
        >
          {t('emailLabel')}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          className="px-4 py-2 rounded-lg text-sm outline-none transition-shadow duration-[var(--duration-fast)] focus:ring-2"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
          aria-label={t('emailLabel')}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="password"
          className="text-sm font-medium"
          style={{ color: 'var(--color-foreground)' }}
        >
          {t('passwordLabel')}
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder={t('passwordPlaceholder')}
          className="px-4 py-2 rounded-lg text-sm outline-none transition-shadow duration-[var(--duration-fast)] focus:ring-2"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
          aria-label={t('passwordLabel')}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-destructive)' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-lg font-semibold cursor-pointer transition-opacity duration-[var(--duration-base)] hover:opacity-90 focus-visible:outline-none"
        style={{
          backgroundColor: 'var(--color-accent)',
          color: 'white',
          opacity: loading ? 0.7 : 1,
          fontFamily: 'Fira Sans, sans-serif',
        }}
      >
        {loading ? t('loggingIn') : t('login')}
      </button>
    </form>
  );
}
