import { useTranslations } from 'next-intl';
import LoginForm from '../../../components/LoginForm';

export default function LoginPage() {
  const t = useTranslations('auth');

  return (
    <main
      className="min-h-screen flex items-center justify-center p-8"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6"
        style={{ backgroundColor: 'var(--color-muted)', boxShadow: 'var(--shadow-xl)' }}
      >
        <div className="text-center">
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
          >
            Cafe Music
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-foreground-50)' }}>
            {t('subtitle')}
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
