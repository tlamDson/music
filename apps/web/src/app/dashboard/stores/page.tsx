'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api-client';
import CoverArt from '../../../components/media/CoverArt';
import CreateStoreDialog from '../../../components/store/CreateStoreDialog';
import ViewToggle from '../../../components/ui/ViewToggle';
import { useViewMode } from '../../../hooks/useViewMode';

interface StoreRow {
  id: string;
  name: string;
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
}

const STATUS_COLOR: Record<StoreRow['status'], string> = {
  PLAYING: 'var(--color-accent)',
  PAUSED: '#EAB308',
  STOPPED: 'var(--color-foreground-25)',
};

export default function StoresPage() {
  const t = useTranslations('dashboard.stores');
  const tCommon = useTranslations('common');
  const statusLabel: Record<StoreRow['status'], string> = {
    PLAYING: tCommon('status.playing'),
    PAUSED: tCommon('status.paused'),
    STOPPED: tCommon('status.stopped'),
  };
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [view, setView] = useViewMode('stores', 'list');

  const fetchStores = () => {
    api
      .get<{ data: StoreRow[] }>('/stores')
      .then((res) => setStores(res.data))
      .catch(() => setStores([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStores();
    const interval = setInterval(fetchStores, 10000);
    return () => clearInterval(interval);
  }, []);

  const visible = stores.filter((store) =>
    store.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

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

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          id="store-search"
          name="store-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAriaLabel')}
          className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
        />
        <div className="flex gap-3">
          <ViewToggle value={view} onChange={setView} />
          <button
            type="button"
            onClick={() => setShowCreateDialog(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-110 focus-visible:outline-none"
            style={{
              backgroundColor: 'var(--color-accent)',
              color: 'white',
            }}
          >
            {t('createDialog.title')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3" role="status" aria-label={t('loadingLabel')}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20" />
          ))}
          <span className="sr-only">{t('loadingText')}</span>
        </div>
      ) : stores.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-foreground-50)' }}>
          {t('empty')}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-foreground-50)' }}>
          {t('noMatches')}
        </p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((store, index) => (
            <Link
              key={store.id}
              href={`/dashboard/stores/${store.id}`}
              className={`p-3 rounded-xl flex flex-col gap-3 cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-125 focus-visible:outline-none focus-visible:brightness-125 ${
                index < 8 ? 'animate-stagger-item' : ''
              }`}
              style={{
                backgroundColor: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
                ...(index < 8 ? ({ '--i': index } as React.CSSProperties) : {}),
              }}
            >
              <CoverArt seed={store.id} label={store.name} size={152} className="w-full" />
              <div className="min-w-0">
                <p className="font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                  {store.name}
                </p>
                <span className="flex items-center gap-2 mt-0.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLOR[store.status] }}
                    aria-hidden="true"
                  />
                  <span
                    className="text-xs truncate"
                    style={{ color: 'var(--color-foreground-50)' }}
                  >
                    {statusLabel[store.status]}
                  </span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((store, index) => (
            <Link
              key={store.id}
              href={`/dashboard/stores/${store.id}`}
              className={`p-4 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-[filter] duration-[var(--duration-fast)] hover:brightness-125 focus-visible:outline-none focus-visible:brightness-125 ${
                index < 8 ? 'animate-stagger-item' : ''
              }`}
              style={{
                backgroundColor: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
                ...(index < 8 ? ({ '--i': index } as React.CSSProperties) : {}),
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <CoverArt seed={store.id} label={store.name} size={44} />
                <div className="min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--color-foreground)' }}>
                    {store.name}
                  </p>
                  <span className="flex items-center gap-2 mt-0.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: STATUS_COLOR[store.status] }}
                      aria-hidden="true"
                    />
                    <span className="text-xs" style={{ color: 'var(--color-foreground-50)' }}>
                      {statusLabel[store.status]}
                    </span>
                  </span>
                </div>
              </div>

              <span
                className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
                style={{
                  backgroundColor: 'var(--color-primary)',
                  color: 'var(--color-foreground)',
                  border: '1px solid var(--color-border)',
                }}
              >
                {t('selectMusic')}
              </span>
            </Link>
          ))}
        </div>
      )}

      <CreateStoreDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreated={() => {
          setShowCreateDialog(false);
          fetchStores();
        }}
      />
    </div>
  );
}
