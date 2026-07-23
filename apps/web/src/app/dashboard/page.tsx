'use client';

import Link from 'next/link';
import StoresOverview from '../../components/store/StoresOverview';

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: 'Fira Code, monospace', color: 'var(--color-foreground)' }}
        >
          Tổng quan
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Nhạc đang chạy ở từng quán trong chuỗi
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
            Đang phát tại các quán
          </h2>
          <Link
            href="/dashboard/stores"
            className="text-xs cursor-pointer underline transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
            style={{ color: 'var(--color-secondary)' }}
          >
            Quản lý quán
          </Link>
        </div>

        <StoresOverview />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-foreground)' }}>
          Bắt đầu phát
        </h2>
        <p className="text-sm" style={{ color: 'rgba(248,250,252,0.5)' }}>
          Chọn playlist ở trang{' '}
          <Link
            href="/dashboard/playlists"
            className="underline cursor-pointer transition-all duration-150 hover:brightness-110 focus-visible:outline-none"
            style={{ color: 'var(--color-secondary)' }}
          >
            Playlists
          </Link>{' '}
          để phát cho cả nhóm sync.
        </p>
      </section>
    </div>
  );
}
