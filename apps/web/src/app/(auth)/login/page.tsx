import LoginForm from '../../components/LoginForm';

export default function LoginPage() {
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
          <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
            Sign in to your account
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
