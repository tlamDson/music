import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { PlayerProvider } from '../components/player/PlayerProvider';
import PlayerBar from '../components/player/PlayerBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cafe Music',
  description: 'Synchronized music for cafe chains',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full flex flex-col"
        style={{ backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' }}
      >
        <PlayerProvider>
          {children}
          {/* Thanh phát chỉ tự hiện khi có nhạc — trang đăng nhập vẫn sạch */}
          <PlayerBar />
        </PlayerProvider>
        <Toaster
          position="bottom-right"
          theme="dark"
          toastOptions={{
            style: {
              backgroundColor: 'var(--color-muted)',
              color: 'var(--color-foreground)',
              border: '1px solid var(--color-border)',
            },
          }}
        />
      </body>
    </html>
  );
}
